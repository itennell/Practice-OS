// A chat edit to a post that's waiting for her ("make it shorter", "change it to
// Wednesday") changes THAT post and its pending approval, instead of queueing a new
// one each time (the Nov 2 stress test piled up five approvals for one post). A post
// made in the studio goes through the studio's own edit path (lib/studio/store.ts
// chatEdit), which keeps the slides, caption and approval in step. Only a post whose
// approval is still pending is changed; an approved or posted one never is.
import { guard, REFUSAL } from "../aeon/guard";
import { audit } from "../audit";
import { db } from "../db";
import { alertCrisis, checkCrisis, CRISIS_REPLY } from "../safety";
import { chatEdit } from "../studio/store";
import type { ChatFn } from "./critic";
import { designPost, type GraphicDeps } from "./graphic";
import { PILLAR_BY_ID, type PillarId } from "./pillars";
import { blockedSummary, practiceFacts } from "./store";
import { writeRevision } from "./write";

export type ReviseResult =
  /** Nothing is waiting for her: the caller drafts a new post instead. */
  | { outcome: "none" }
  | { outcome: "not_pending"; why: string }
  | { outcome: "refused"; why: string }
  | { outcome: "revised"; postId: string; approvalId: string; headline: string; via: "post" | "studio"; projectId?: string };

/** Her words read like a change to the post she has, not a new one. */
export function looksLikeEdit(request: string): boolean {
  const t = request.trim();
  if (t.length > 160 || /\b(new|another|second|different) (post|reel|carousel)\b|\bpost about\b/i.test(t)) return false;
  return /^(?:please\s+|can you\s+|could you\s+)?(?:make (?:it|that|this|the (?:post|caption|headline|picture))|change (?:it|that|this|the)|shorten|shorter|longer|add\b|remove|take out|drop|swap|fix|reword|rewrite (?:it|that|this)|say\b|use\b|instead\b|less\b|more\b)/i.test(t);
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

export async function revisePost(by: string, change: string, opts: { postId?: string; chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<ReviseResult> {
  const post = await target(opts.postId);
  if (!post) {
    if (!opts.postId) return { outcome: "none" };
    return { outcome: "not_pending", why: "That post isn't waiting for your approval any more, so it can't change here. Ask me for a new one." };
  }
  if (post.project_id) {
    const r = await chatEdit(post.project_id, change, { by, chat: opts.chat });
    if (!r.ok) return { outcome: "refused", why: r.why };
    return { outcome: "revised", postId: post.id, approvalId: post.approval_id, headline: r.project.doc.title, via: "studio", projectId: post.project_id };
  }
  // Her words go through the same checks as any chat message before any model call.
  const crisis = checkCrisis(change);
  if (crisis.crisis) {
    await audit({ actor: "safety", action: "crisis_reply", subjectType: "post", subjectId: post.id, details: { category: crisis.category, by } });
    await alertCrisis({ source: "media", category: crisis.category, by });
    return { outcome: "refused", why: CRISIS_REPLY };
  }
  const g = await guard(change, "message");
  if (!g.ok) return { outcome: "refused", why: REFUSAL[g.kind] };

  const facts = await practiceFacts();
  const body = post.caption.replace(facts.licenseLine, "").trim();
  const pillar: PillarId = post.topic === "other" ? "first_session" : post.topic;
  const draft = await writeRevision(facts, { pillar, headline: post.headline ?? "", body }, change, { chat: opts.chat });
  if (draft.critic.hardStop) return { outcome: "refused", why: CRISIS_REPLY };
  if (!draft.critic.ok) return { outcome: "refused", why: `I didn't change it: ${blockedSummary(draft.critic)} The post waiting for you is unchanged.` };

  // The headline is drawn on the picture, so a new headline gets a new picture.
  let jpeg: Buffer | null = null;
  if (draft.headline !== post.headline) {
    const graphic = await designPost(PILLAR_BY_ID.get(pillar)!, { headline: draft.headline, practiceName: facts.practiceName, licenseLine: facts.licenseLine }, { neverShow: facts.voice?.neverShow, ...opts.graphic, chat: opts.chat });
    if (graphic.check.ok) jpeg = graphic.jpeg;
  }
  const [saved] = await db()<{ id: string }[]>`
    update practice_os.posts
       set caption = ${draft.caption}, headline = ${jpeg || draft.headline === post.headline ? draft.headline : post.headline},
           alt_text = ${draft.altText}, critic = ${db().json(draft.critic as never)}, image_jpeg = coalesce(${jpeg}, image_jpeg)
     where id = ${post.id} and status = 'pending_approval'
       and exists (select 1 from practice_os.approvals a where a.id = ${post.approval_id} and a.status = 'pending')
    returning id`;
  if (!saved) return { outcome: "not_pending", why: "That post was approved or changed just now, so I left it as it is." };
  const headline = jpeg || draft.headline === post.headline ? draft.headline : (post.headline ?? draft.headline);
  await db()`
    update practice_os.approvals
       set title = ${`Instagram post: ${headline}`},
           preview = preview || ${db().json({ body: draft.caption, headline, alt_text: draft.altText } as never)}
     where id = ${post.approval_id} and status = 'pending'`;
  await audit({ actor: "aeon", action: "instagram_post_revised", subjectType: "post", subjectId: post.id, details: { approval_id: post.approval_id, by } });
  return { outcome: "revised", postId: post.id, approvalId: post.approval_id, headline, via: "post" };
}
