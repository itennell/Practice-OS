// Regenerate on a "Facts changed" flag (lib/studio/stale.ts): a post or studio project
// whose words her saved details now contradict is made again from her current facts.
// The new one is told what to avoid (the flagged claims, never the stale headline), the
// old post and its waiting approval are retired so the stale words can't be approved,
// and each regenerate counts toward the studio's daily cap (shared with make_studio_post).
import { audit } from "../audit";
import { db } from "../db";
import type { ChatFn } from "../instagram/critic";
import type { GraphicDeps } from "../instagram/graphic";
import { PILLAR_BY_ID, type PillarId } from "../instagram/pillars";
import { requestPost, type RequestResult } from "../instagram/store";
import { currentTruth, docTexts, factsChanged } from "./stale";
import { getProject, makeProject, type MakeEvent, type Project } from "./store";

/** Each studio make or regenerate spends a model call and a picture: at most this many a day. */
export const STUDIO_DAILY_CAP = 8;
export const CAP_REACHED = `I've made ${STUDIO_DAILY_CAP} studio posts today, which is the daily limit. You can change the ones you have, or ask again tomorrow.`;

/** Studio projects made today plus posts regenerated today. */
export async function madeToday(): Promise<number> {
  const [row] = await db()<{ n: number }[]>`
    select (select count(*) from practice_os.studio_projects where created_at >= date_trunc('day', now()))::int
         + (select count(*) from practice_os.posts where created_at >= date_trunc('day', now()) and critic ? 'regenerated_from')::int as n`;
  return row?.n ?? 0;
}

export const REPLACED = "Replaced by a new version after your saved details changed.";
const NOTHING = "Nothing here disagrees with your saved details, so there's nothing to update.";

/** What the new version must not say, as data for the writer (her saved facts win). */
export function avoidLine(problems: string[]): string {
  return `avoid: ${problems.map((p) => p.replace(/^It /, "").replace(/\.$/, "")).join("; ")}`.slice(0, 400);
}

/** The old post and its waiting approval stop being approvable; the board hides it. */
async function retire(postId: string, by: string, newPostId: string | null) {
  await db().begin(async (tx) => {
    const [p] = await tx<{ approval_id: string | null }[]>`
      update practice_os.posts
         set status = 'failed', failed_reason = ${REPLACED},
             critic = coalesce(critic, '{}'::jsonb) || jsonb_build_object('superseded_by', ${newPostId}::text)
       where id = ${postId} and status in ('pending_approval', 'draft', 'failed', 'ready')
      returning approval_id`;
    if (p?.approval_id) await tx`update practice_os.approvals set status = 'rejected', error = ${REPLACED}, decided_at = now(), decided_by = ${by} where id = ${p.approval_id} and status = 'pending'`;
  });
  await audit({ actor: "aeon", action: "post_superseded", subjectType: "post", subjectId: postId, details: { by, superseded_by: newPostId } });
}

export type RegenerateResult = { ok: false; status: number; why: string } | ({ ok: true } & RequestResult);

/** A board post, written again on the same topic from her current facts. */
export async function regeneratePost(by: string, postId: string, opts: { chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<RegenerateResult> {
  const [post] = await db()<{ id: string; topic: PillarId | "other"; headline: string | null; caption: string; status: string }[]>`
    select id, topic, headline, caption, status from practice_os.posts where id = ${postId}`;
  if (!post) return { ok: false, status: 404, why: "That post isn't here any more." };
  if (post.status === "published" || post.status === "blocked") return { ok: false, status: 409, why: "This post can't be regenerated." };
  const problems = factsChanged([post.headline ?? "", post.caption], await currentTruth());
  if (!problems.length) return { ok: false, status: 409, why: NOTHING };
  if ((await madeToday()) >= STUDIO_DAILY_CAP) return { ok: false, status: 429, why: CAP_REACHED };
  const pillar = post.topic === "other" ? null : post.topic;
  const about = pillar ? PILLAR_BY_ID.get(pillar)!.label : "my practice";
  const r = await requestPost(by, `A new post about ${about.toLowerCase()}. ${avoidLine(problems)}`, pillar, opts);
  if ("post" in r) {
    await db()`update practice_os.posts set critic = coalesce(critic, '{}'::jsonb) || jsonb_build_object('regenerated_from', ${post.id}::text) where id = ${r.post.id}`;
    if (r.post.status !== "blocked") await retire(post.id, by, r.post.id);
  }
  return { ok: true, ...r };
}

/** A studio project, made again (same kind and topic) from her current facts. */
export async function regenerateProject(by: string, projectId: string, emit: (e: MakeEvent) => void, deps: Parameters<typeof makeProject>[3] = {}): Promise<Project | null> {
  const old = await getProject(projectId);
  if (!old) return stop(emit, "That project isn't here any more.");
  if (old.doc.kind === "video") return stop(emit, "A video from your own footage can't be regenerated. Change its words on the canvas.");
  const problems = factsChanged(docTexts(old.doc), await currentTruth());
  if (!problems.length) return stop(emit, NOTHING);
  if ((await madeToday()) >= STUDIO_DAILY_CAP) return stop(emit, CAP_REACHED);
  const topic = (old.doc.topic || "my practice").replace(/\.?\s*avoid:[\s\S]*$/i, "").slice(0, 200);
  const made = await makeProject(by, `Make a ${old.doc.kind} about ${topic}. ${avoidLine(problems)}`, emit, deps);
  if (made && old.postId) await retire(old.postId, by, made.postId ?? null);
  return made;
}

function stop(emit: (e: MakeEvent) => void, why: string): null {
  emit({ type: "stop", why });
  return null;
}
