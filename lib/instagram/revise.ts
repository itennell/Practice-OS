// A chat edit to a post that's waiting for her ("make it shorter", "change it to
// Wednesday") changes THAT post and its pending approval, instead of queueing a new
// one each time (the Nov 2 stress test piled up five approvals for one post). A post
// made in the studio goes through the studio's own edit path (lib/studio/store.ts
// chatEdit), which keeps the slides, caption and approval in step. Only a post whose
// approval is still pending is changed; an approved or posted one never is, and a
// change that can't be made whole (a picture that fails its check) changes nothing.
import { audit } from "../audit";
import { db } from "../db";
import { CRISIS_REPLY } from "../safety";
import { chatEdit, getProject } from "../studio/store";
import type { ChatFn } from "./critic";
import { designPost, type GraphicDeps } from "./graphic";
import { PILLAR_BY_ID, type PillarId } from "./pillars";
import { blockedSummary, checkRequest, practiceFacts } from "./store";
import { writeRevision } from "./write";

export type ReviseResult =
  /** Nothing is waiting for her: the caller drafts a new post instead. */
  | { outcome: "none" }
  | { outcome: "not_pending"; why: string }
  | { outcome: "refused"; why: string }
  /** Aeon understood but changed nothing (a question back, or nothing to do). */
  | { outcome: "unchanged"; why: string }
  | { outcome: "revised"; postId: string; approvalId: string; headline: string; via: "post" | "studio"; projectId?: string };

const EDIT_VERB = /^(?:please\s+|can you\s+|could you\s+)?(?:make|change|shorten|lengthen|add|remove|take out|drop|swap|fix|reword|rewrite|edit|update|cut|trim|replace|say)\s/i;
const POST_REF = /\b(?:it|this|that|this one|that one|the (?:post|caption|headline|picture|image|slide|text|words|copy|reel|carousel|title)|slide \d+)\b/i;

/**
 * Her words are a change to the post she has, not a new one: an edit verb first AND a
 * word pointing at the post ("make it shorter", "change slide 2"). "Drop-in hours on
 * Fridays" has neither, so it stays a new post.
 */
export function looksLikeEdit(request: string): boolean {
  const t = request.trim();
  if (t.length > 160 || /\b(?:new|another|second|different) (?:post|reel|carousel)\b|\bposts? (?:about|on)\b/i.test(t)) return false;
  return EDIT_VERB.test(t) && POST_REF.test(t);
}

type Target = { id: string; topic: PillarId | "other"; headline: string | null; caption: string; alt_text: string | null; approval_id: string; project_id: string | null };

/** The post to change: the one she named, else her newest post still waiting for approval. */
async function target(postId?: string): Promise<Target | null> {
  const [row] = await db()<Target[]>`
    select p.id, p.topic, p.headline, p.caption, p.alt_text, p.approval_id,
           (select s.id from practice_os.studio_projects s where s.post_id = p.id order by s.updated_at desc limit 1) as project_id
      from practice_os.posts p join practice_os.approvals a on a.id = p.approval_id
     where p.status = 'pending_approval' and a.status = 'pending' and a.kind = 'instagram_post'
       and (${postId ?? null}::uuid is null or p.id = ${postId ?? null}::uuid)
     order by p.created_at desc limit 1`;
  return row ?? null;
}

const NOT_PENDING = "That post isn't waiting for your approval any more, so it can't change here. Ask me for a new one.";

export async function revisePost(by: string, change: string, opts: { postId?: string; chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<ReviseResult> {
  const post = await target(opts.postId);
  if (!post) return opts.postId ? { outcome: "not_pending", why: NOT_PENDING } : { outcome: "none" };
  // Her words get the same checks as a new post topic before any model call:
  // the crisis check (fixed reply and alert), the PHI guard, then the logistics topic gate.
  const gate = await checkRequest(change, by);
  if (gate) return { outcome: "refused", why: gate.why };

  if (post.project_id) {
    const before = await getProject(post.project_id);
    const r = await chatEdit(post.project_id, change, { by, chat: opts.chat });
    if (!r.ok) return { outcome: "refused", why: r.why };
    // chatEdit answers ok with no ops when Muse only replied; that's no revision.
    if (before && r.project.cursor === before.cursor && JSON.stringify(r.project.doc) === JSON.stringify(before.doc)) return { outcome: "unchanged", why: r.reply };
    return { outcome: "revised", postId: post.id, approvalId: post.approval_id, headline: r.project.doc.title, via: "studio", projectId: post.project_id };
  }

  const facts = await practiceFacts();
  const body = post.caption.replace(facts.licenseLine, "").trim();
  const pillar: PillarId = post.topic === "other" ? "first_session" : post.topic;
  const draft = await writeRevision(facts, { pillar, headline: post.headline ?? "", body }, change, { chat: opts.chat });
  if (draft.critic.hardStop) return { outcome: "refused", why: CRISIS_REPLY };
  if (!draft.critic.ok) return { outcome: "refused", why: `I didn't change it: ${blockedSummary(draft.critic)} The post waiting for you is unchanged.` };

  // The headline is drawn on the picture: a new headline needs a new picture that passes its
  // check, or nothing changes at all (never new words over an old picture).
  let jpeg: Buffer | null = null;
  if (draft.headline !== post.headline) {
    const graphic = await designPost(PILLAR_BY_ID.get(pillar)!, { headline: draft.headline, practiceName: facts.practiceName, licenseLine: facts.licenseLine }, { neverShow: facts.voice?.neverShow, ...opts.graphic, chat: opts.chat });
    if (!graphic.check.ok) return { outcome: "refused", why: "The new picture didn't pass its check, so nothing changed. The post waiting for you is as it was." };
    jpeg = graphic.jpeg;
  }

  // The post and its approval change together, only while the approval is still pending.
  const saved = await db().begin(async (tx) => {
    const [a] = await tx<{ status: string }[]>`select status from practice_os.approvals where id = ${post.approval_id} for update`;
    if (a?.status !== "pending") return false;
    const [p] = await tx<{ id: string }[]>`
      update practice_os.posts
         set caption = ${draft.caption}, headline = ${draft.headline}, alt_text = ${draft.altText},
             critic = ${tx.json(draft.critic as never)}, image_jpeg = coalesce(${jpeg}, image_jpeg)
       where id = ${post.id} and status = 'pending_approval' and approval_id = ${post.approval_id}
      returning id`;
    if (!p) return false;
    await tx`
      update practice_os.approvals
         set title = ${`Instagram post: ${draft.headline}`},
             preview = preview || ${tx.json({ body: draft.caption, headline: draft.headline, alt_text: draft.altText, notes: draft.notes } as never)}
       where id = ${post.approval_id} and status = 'pending'`;
    return true;
  });
  if (!saved) return { outcome: "not_pending", why: NOT_PENDING };
  await audit({ actor: "aeon", action: "instagram_post_revised", subjectType: "post", subjectId: post.id, details: { approval_id: post.approval_id, by } });
  return { outcome: "revised", postId: post.id, approvalId: post.approval_id, headline: draft.headline, via: "post" };
}
