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
import { writeRequested, writeWeek, type Draft, type PracticeFacts } from "./write";

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
     where ${opts.week ? db()`p.week_of = ${opts.week}` : db()`true`}
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
  | { outcome: "queued" | "rewritten" | "blocked_after_rewrite"; post: SavedPost; headline: string; why: string | null };

/** One post she asked for. A request about a client is never written as asked. */
export async function requestPost(by: string, request: string, pillar: PillarId | null, opts: { chat?: ChatFn; graphic?: GraphicDeps } = {}): Promise<RequestResult> {
  if (await instagramDeclined()) return { outcome: "declined", why: DECLINED };
  const facts = await practiceFacts();
  const out = await writeRequested(facts, request, pillar, { chat: opts.chat });
  if (out.kind === "hard_stop") {
    await audit({ actor: "aeon", action: "instagram_request_refused", subjectType: "post", details: { rules: out.critic.findings.map((f) => f.rule) } });
    return { outcome: "blocked", why: blockedSummary(out.critic) };
  }
  const post = await saveDraft(out.draft, { by, facts, graphic: opts.graphic && { chat: opts.chat, ...opts.graphic } });
  if (post.status === "blocked") return { outcome: "blocked_after_rewrite", post, headline: out.draft.headline, why: blockedSummary(out.draft.critic) };
  const why = out.requestBlocked ? blockedSummary(out.requestBlocked) : null;
  return { outcome: why || out.draft.rewritten ? "rewritten" : "queued", post, headline: out.draft.headline, why };
}
