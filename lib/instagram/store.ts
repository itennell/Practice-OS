// Instagram posts in practice_os.posts (migration 015), and the one way a post
// reaches Dana: a pending instagram_post approval.
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { db } from "../db";
import { loadPracticeSettings } from "../gfe/store";
import type { ChatFn, CriticResult } from "./critic";
import { designPost, type GraphicDeps } from "./graphic";
import { GOALS, instagramDeclined, loadInstagramPrefs, weekTopics } from "./onboarding";
import { PILLAR_BY_ID, type PillarId } from "./pillars";
import { research, type Research, type SearchFn } from "./research";
import { gateTopic, type Angle } from "./topic-gate";
import { writeRequested, writeSeveral, writeWeek, type Draft, type PracticeFacts } from "./write";

export async function practiceFacts(): Promise<PracticeFacts> {
  const [p] = await db()<
    { full_name: string; credential: string; practice_name: string; neighborhood: string | null; city: string; license_line: string; is_sample: boolean }[]
  >`select full_name, credential, practice_name, neighborhood, city, license_line, is_sample from practice_os.clinician_profile limit 1`;
  if (!p) throw new Error("Finish setting up your practice first, so Aeon knows what to write.");
  const [{ fees }, prefs] = await Promise.all([loadPracticeSettings(), loadInstagramPrefs()]);
  return {
    clinicianName: p.full_name,
    credential: p.credential,
    practiceName: p.practice_name,
    neighborhood: p.neighborhood,
    city: p.city,
    licenseLine: p.license_line,
    fees: fees.map((f) => ({ label: f.label, cents: f.cents })),
    voice: {
      style: prefs.style,
      example: prefs.example,
      goals: prefs.goals.map((g) => GOALS.find((x) => x.value === g)!.label),
      neverShow: prefs.neverShow,
    },
  };
}

/** Monday of the week that holds `day` (YYYY-MM-DD). */
export function weekOf(day: Date = new Date()): string {
  const d = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type SavedPost = { id: string; approvalId: string | null; status: "pending_approval" | "blocked" };

/**
 * Saves one checked draft. A passing draft gets its picture and an approval;
 * a blocked one is saved as blocked (no picture) so the page can say why.
 */
export async function saveDraft(draft: Draft, opts: { by: string; week?: string; graphic?: GraphicDeps; facts: PracticeFacts }): Promise<SavedPost> {
  const week = opts.week ?? weekOf();
  if (!draft.critic.ok) {
    const reason = draft.critic.findings.map((f) => f.message).join(" ");
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.posts (topic, caption, headline, alt_text, status, blocked_reason, critic, week_of)
      values (${draft.pillar}, ${draft.caption}, ${draft.headline}, ${draft.altText}, 'blocked', ${reason},
              ${db().json(draft.critic as never)}, ${week})
      returning id`;
    await audit({ actor: "aeon", action: "instagram_draft_blocked", subjectType: "post", subjectId: row.id, details: { rules: draft.critic.findings.map((f) => f.rule) } });
    return { id: row.id, approvalId: null, status: "blocked" };
  }

  const graphic = await designPost(
    PILLAR_BY_ID.get(draft.pillar)!,
    { headline: draft.headline, practiceName: opts.facts.practiceName, licenseLine: opts.facts.licenseLine },
    { neverShow: opts.facts.voice?.neverShow, ...opts.graphic },
  );
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.posts (topic, caption, headline, alt_text, image_jpeg, status, critic, graphic_check, week_of)
    values (${draft.pillar}, ${draft.caption}, ${draft.headline}, ${draft.altText}, ${graphic.jpeg}, 'pending_approval',
            ${db().json(draft.critic as never)}, ${db().json({ ...graphic.check, tries: graphic.tries } as never)}, ${week})
    returning id`;
  const approvalId = await queueApproval({
    kind: "instagram_post",
    title: `Instagram post: ${draft.headline}`,
    preview: {
      body: draft.caption,
      headline: draft.headline,
      alt_text: draft.altText,
      image: `/api/instagram/posts/${row.id}/image`,
      picture_check: graphic.check.ok ? "passed" : graphic.check.problems.join(" "),
    },
    payload: { post_id: row.id },
    createdBy: opts.by,
  });
  // The executor may already have claimed it (Bypass mode); only fill an empty slot.
  await db()`update practice_os.posts set approval_id = ${approvalId} where id = ${row.id} and approval_id is null`;
  return { id: row.id, approvalId, status: "pending_approval" };
}

export type PostView = {
  id: string;
  pillar: PillarId | "other";
  headline: string | null;
  caption: string;
  altText: string | null;
  status: string;
  blockedReason: string | null;
  failedReason: string | null;
  approvalId: string | null;
  approvalStatus: string | null;
  permalink: string | null;
  hasImage: boolean;
  weekOf: string | null;
  createdAt: string;
};

export async function listPosts(opts: { week?: string; limit?: number } = {}): Promise<PostView[]> {
  const rows = await db()<
    {
      id: string; topic: PillarId | "other"; headline: string | null; caption: string; alt_text: string | null; status: string;
      blocked_reason: string | null; failed_reason: string | null; approval_id: string | null; approval_status: string | null;
      ig_permalink: string | null; has_image: boolean; week_of: Date | null; created_at: Date;
    }[]
  >`
    select p.id, p.topic, p.headline, p.caption, p.alt_text, p.status, p.blocked_reason, p.failed_reason, p.approval_id,
           a.status as approval_status, p.ig_permalink, p.image_jpeg is not null as has_image, p.week_of, p.created_at
      from practice_os.posts p left join practice_os.approvals a on a.id = p.approval_id
     where p.status <> 'idea' and ${opts.week ? db()`p.week_of = ${opts.week}` : db()`true`}
     order by p.created_at desc
     limit ${opts.limit ?? 50}`;
  return rows.map((r) => ({
    id: r.id,
    pillar: r.topic,
    headline: r.headline,
    caption: r.caption,
    altText: r.alt_text,
    status: r.status,
    blockedReason: r.blocked_reason,
    failedReason: r.failed_reason,
    approvalId: r.approval_id,
    approvalStatus: r.approval_status,
    permalink: r.ig_permalink,
    hasImage: r.has_image,
    weekOf: r.week_of ? new Date(r.week_of).toISOString().slice(0, 10) : null,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function postImage(id: string): Promise<Buffer | null> {
  const [row] = await db()<{ image_jpeg: Buffer | null }[]>`select image_jpeg from practice_os.posts where id = ${id}`;
  return row?.image_jpeg ? Buffer.from(row.image_jpeg) : null;
}

/** What the page and the chat say about a blocked draft. */
export function blockedSummary(c: CriticResult): string {
  return [...new Set(c.findings.map((f) => f.message))].join(" ");
}

// ---- the two things Dana (or Aeon in chat) can ask for -----------------------------------

export type PlanResult = { week: string; saved: SavedPost[]; blocked: number; declined?: true };

/** What Aeon says when she said Instagram isn't for her (onboarding): nothing is written. */
export const DECLINED = "You said Instagram isn't for you, so I haven't written anything. You can change that in Settings.";

/** Plan this week: one draft per topic she picked (five by default), each checked, drawn and queued for approval. */
export async function planWeek(by: string, opts: { chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<PlanResult> {
  if (await instagramDeclined()) return { week: weekOf(), saved: [], blocked: 0, declined: true };
  const facts = await practiceFacts();
  const drafts = await writeWeek(facts, { chat: opts.chat, topics: weekTopics(await loadInstagramPrefs()) });
  const week = weekOf();
  const saved: SavedPost[] = [];
  for (const d of drafts) saved.push(await saveDraft(d, { by, week, facts, graphic: opts.graphic && { chat: opts.chat, ...opts.graphic } }));
  return { week, saved, blocked: saved.filter((s) => s.status === "blocked").length };
}

export type RequestResult =
  | { outcome: "blocked"; why: string }
  | { outcome: "declined"; why: string }
  /** Her topic is advice (or a client story, review, promise): nothing written, the nearest logistics angle offered. */
  | { outcome: "off_topic"; why: string; angle: Angle }
  | { outcome: "queued" | "rewritten" | "blocked_after_rewrite"; post: SavedPost; headline: string; why: string | null };

/** One post she asked for. A request about a client is never written as asked. */
export async function requestPost(
  by: string,
  request: string,
  pillar: PillarId | null,
  opts: { chat?: ChatFn; graphic?: GraphicDeps; researchId?: string } = {},
): Promise<RequestResult> {
  if (await instagramDeclined()) return { outcome: "declined", why: DECLINED };
  const gate = await checkRequest(request);
  if (gate) return gate;
  const facts = await practiceFacts();
  const out = await writeRequested(facts, request, pillar, { chat: opts.chat });
  if (out.kind === "hard_stop") {
    await audit({ actor: "aeon", action: "instagram_request_refused", subjectType: "post", details: { rules: out.critic.findings.map((f) => f.rule) } });
    return { outcome: "blocked", why: blockedSummary(out.critic) };
  }
  const post = await saveDraft(out.draft, { by, facts, graphic: opts.graphic && { chat: opts.chat, ...opts.graphic } });
  await linkResearch([post.id], opts.researchId);
  if (post.status === "blocked") return { outcome: "blocked_after_rewrite", post, headline: out.draft.headline, why: blockedSummary(out.draft.critic) };
  const why = out.requestBlocked ? blockedSummary(out.requestBlocked) : null;
  return { outcome: why || out.draft.rewritten ? "rewritten" : "queued", post, headline: out.draft.headline, why };
}

/** The topic gate, audited: a hard stop or an off-topic request never reaches the writer. */
async function checkRequest(request: string): Promise<Extract<RequestResult, { outcome: "blocked" | "off_topic" }> | null> {
  const gate = gateTopic(request);
  if (gate.ok) return null;
  await audit({ actor: "aeon", action: gate.hardStop ? "instagram_request_refused" : "instagram_request_redirected", subjectType: "post", details: { rules: [gate.rule] } });
  return gate.hardStop ? { outcome: "blocked", why: gate.why } : { outcome: "off_topic", why: gate.why, angle: gate.angle };
}

export type SeveralResult =
  | Extract<RequestResult, { outcome: "blocked" | "declined" | "off_topic" }>
  | { outcome: "planned"; saved: SavedPost[]; blocked: number };

/** Plan several: 2 or 3 posts on what she typed, each checked, drawn and queued for her approval. */
export async function planSeveral(
  by: string,
  request: string,
  count: 2 | 3,
  opts: { chat?: ChatFn; graphic?: GraphicDeps; researchId?: string } = {},
): Promise<SeveralResult> {
  if (await instagramDeclined()) return { outcome: "declined", why: DECLINED };
  const gate = await checkRequest(request);
  if (gate) return gate;
  const facts = await practiceFacts();
  const drafts = await writeSeveral(facts, request, count, { chat: opts.chat });
  const saved: SavedPost[] = [];
  for (const d of drafts) saved.push(await saveDraft(d, { by, facts, graphic: opts.graphic && { chat: opts.chat, ...opts.graphic } }));
  await linkResearch(saved.map((x) => x.id), opts.researchId);
  return { outcome: "planned", saved, blocked: saved.filter((s) => s.status === "blocked").length };
}

/** Points posts at the research behind them (migration 021). */
async function linkResearch(postIds: string[], researchId: string | undefined) {
  if (!researchId || !postIds.length) return;
  await db()`update practice_os.posts set research_id = ${researchId} where id = any(${postIds}::uuid[])`;
}

export type ResearchResult =
  | Extract<RequestResult, { outcome: "blocked" | "declined" | "off_topic" }>
  | { outcome: "researched"; research: Research };

/** Research first: the topic gate, then three small web searches and 2-3 angles she picks from. */
export async function researchPost(topic: string, opts: { search?: SearchFn; chat?: ChatFn } = {}): Promise<ResearchResult> {
  if (await instagramDeclined()) return { outcome: "declined", why: DECLINED };
  const gate = await checkRequest(topic);
  if (gate) return gate;
  const [p] = await db()<{ is_sample: boolean }[]>`select is_sample from practice_os.clinician_profile limit 1`;
  return { outcome: "researched", research: await research(topic, { ...opts, isSample: p?.is_sample ?? false }) };
}

export type RetryResult = { ok: true; approvalId: string } | { ok: false; status: number; why: string };

/**
 * Retry a post whose picture didn't finish (or that never reached her approvals):
 * draw the picture again from its saved words and queue a fresh approval. Blocked
 * and ready posts are never retried.
 */
export async function retryPost(by: string, postId: string, opts: { graphic?: GraphicDeps } = {}): Promise<RetryResult> {
  if (await instagramDeclined()) return { ok: false, status: 409, why: DECLINED };
  const [p] = await db()<{ id: string; topic: PillarId | "other"; caption: string; headline: string | null; alt_text: string | null; status: string; approval_status: string | null }[]>`
    select p.id, p.topic, p.caption, p.headline, p.alt_text, p.status, a.status as approval_status
      from practice_os.posts p left join practice_os.approvals a on a.id = p.approval_id
     where p.id = ${postId}`;
  if (!p) return { ok: false, status: 404, why: "That post isn't here any more." };
  if (p.status === "blocked" || p.status === "ready" || p.status === "published" || p.approval_status === "pending" || p.approval_status === "running") {
    return { ok: false, status: 409, why: "This post doesn't need a retry." };
  }
  const facts = await practiceFacts();
  const headline = p.headline ?? "Post";
  const graphic = await designPost(
    PILLAR_BY_ID.get(p.topic === "other" ? "first_session" : p.topic)!,
    { headline, practiceName: facts.practiceName, licenseLine: facts.licenseLine },
    { neverShow: facts.voice?.neverShow, ...opts.graphic },
  );
  await db()`
    update practice_os.posts
       set image_jpeg = ${graphic.jpeg}, graphic_check = ${db().json({ ...graphic.check, tries: graphic.tries } as never)},
           status = 'pending_approval', failed_reason = null, approval_id = null
     where id = ${p.id}`;
  const approvalId = await queueApproval({
    kind: "instagram_post",
    title: `Instagram post: ${headline}`,
    preview: { body: p.caption, headline, alt_text: p.alt_text, image: `/api/instagram/posts/${p.id}/image`, picture_check: graphic.check.ok ? "passed" : graphic.check.problems.join(" ") },
    payload: { post_id: p.id },
    createdBy: by,
  });
  await db()`update practice_os.posts set approval_id = ${approvalId} where id = ${p.id} and approval_id is null`;
  await audit({ actor: "clinician", action: "instagram_post_retried", subjectType: "post", subjectId: p.id, details: { approval_id: approvalId } });
  return { ok: true, approvalId };
}
