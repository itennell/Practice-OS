// Grow's saved state: her planner numbers and ad settings (clinician_profile
// .onboarding_answers -> 'growth', like Media's answers), and the drafts
// (practice_os.growth_drafts, migration 042). A draft is queued as an approval only
// when the policy check passes; approving it marks it ready (lib/executors/growth.ts)
// and unlocks the downloads. Nothing here calls an ad platform or publishes a site.
import { z } from "zod";
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { db } from "../db";
import { loadPracticeSettings } from "../gfe/store";
import { loadMediaFacts, type MediaFacts } from "../media/facts";
import { payerById } from "../payers/catalog";
import { listPayerApplications } from "../payers/store";
import { DEFAULT_RADIUS_MILES, draftGoogleAds, draftMetaAds, type GoogleAdsDraft, type GrowthSettings, type MetaAdsDraft } from "./ads";
import { makeAdImage } from "./image";
import { planInputSchema, privatePayPlan, SAMPLE_INPUT, type PlanInput, type PrivatePayPlan } from "./plan";
import { draftSite, type SiteDraft } from "./site";

export const DRAFT_KINDS = ["google_ads", "meta_ads", "website"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export type DraftBody = GoogleAdsDraft | MetaAdsDraft | SiteDraft;

/** [Sample] ad settings for the demo practice until she sets her own. */
export const SAMPLE_CAP_CENTS = 30_000;

const httpsUrl = z.string().trim().max(300).url().regex(/^https:\/\//, "Use an https:// address.");
export const settingsSchema = z
  .object({
    plan: planInputSchema.optional(),
    site_url: httpsUrl.nullable().optional(),
    booking_url: httpsUrl.nullable().optional(),
    monthly_cap_cents: z.number().int().min(1000).max(5_000_000).nullable().optional(),
    radius_miles: z.number().min(1).max(50).optional(),
  })
  .strict();
export type SavedGrowth = z.infer<typeof settingsSchema>;

export async function loadSavedGrowth(): Promise<SavedGrowth> {
  const [row] = await db()<{ g: unknown }[]>`select onboarding_answers -> 'growth' as g from practice_os.clinician_profile limit 1`;
  const r = settingsSchema.safeParse(row?.g ?? {});
  return r.success ? r.data : {};
}

export async function saveGrowth(patch: SavedGrowth): Promise<SavedGrowth> {
  const merged = settingsSchema.parse({ ...(await loadSavedGrowth()), ...patch });
  await db()`
    update practice_os.clinician_profile
       set onboarding_answers = jsonb_set(coalesce(onboarding_answers, '{}'::jsonb), '{growth}', ${db().json(merged as never)}, true)`;
  return merged;
}

export type GrowthContext = { facts: MediaFacts; settings: GrowthSettings; saved: SavedGrowth; licenseLine: string | null; usingSample: boolean };

export async function loadGrowthContext(): Promise<GrowthContext> {
  const [facts, saved, [p]] = await Promise.all([
    loadMediaFacts(),
    loadSavedGrowth(),
    db()<{ license_line: string | null }[]>`select license_line from practice_os.clinician_profile limit 1`,
  ]);
  const usingSample = facts.isSample && saved.monthly_cap_cents === undefined;
  return {
    facts,
    saved,
    licenseLine: p?.license_line ?? null,
    usingSample,
    settings: {
      siteUrl: saved.site_url ?? null,
      bookingUrl: saved.booking_url ?? null,
      monthlyCapCents: saved.monthly_cap_cents !== undefined ? saved.monthly_cap_cents : facts.isSample ? SAMPLE_CAP_CENTS : null,
      radiusMiles: saved.radius_miles ?? DEFAULT_RADIUS_MILES,
    },
  };
}

/** Her saved planner numbers; else panels from her approved payers with the numbers left to ask; [Sample] numbers for the demo practice. */
export async function planInputFor(saved: SavedGrowth, isSample: boolean): Promise<{ input: PlanInput; sample: boolean }> {
  if (saved.plan) return { input: saved.plan, sample: false };
  if (isSample) return { input: SAMPLE_INPUT, sample: true };
  const apps = await listPayerApplications();
  const panels = apps
    .filter((a) => a.status === "approved")
    .map((a) => ({ payer: a.payer, weekly_sessions: null, rate_cents: null, kind: (a.catalog_id && payerById(a.catalog_id)?.kind) || "other" }));
  return { input: { panels, target_weekly_sessions: null, target_monthly_income_cents: null }, sample: false };
}

export async function loadPlan(patch?: Partial<PlanInput>): Promise<{ plan: PrivatePayPlan; input: PlanInput; sample: boolean }> {
  const [ctx, settings] = await Promise.all([loadGrowthContext(), loadPracticeSettings()]);
  const base = await planInputFor(ctx.saved, ctx.facts.isSample);
  const input = patch ? planInputSchema.parse({ ...base.input, ...patch }) : base.input;
  return { plan: privatePayPlan(input, settings.fees), input, sample: base.sample && !patch };
}

// ---- drafts -------------------------------------------------------------------------

export type DraftRow = {
  id: string;
  kind: DraftKind;
  draft: DraftBody;
  status: "pending_approval" | "ready" | "declined";
  policy_ok: boolean;
  approval_id: string | null;
  approval_status: string | null;
  has_image: boolean;
  is_sample: boolean;
  created_at: Date;
};

const TITLES: Record<DraftKind, string> = { google_ads: "Google Search ads draft", meta_ads: "Facebook and Instagram ads draft", website: "One-page website draft" };

export class PolicyBlocked extends Error {
  constructor(public findings: { where: string; message: string }[]) {
    super(`The policy check found ${findings.length} problem${findings.length === 1 ? "" : "s"}: ${findings.map((f) => `${f.where}: ${f.message}`).join(" ")}`);
    this.name = "PolicyBlocked";
  }
}

/** Builds the draft for a kind from her saved facts, in plain code. */
export async function buildDraft(kind: DraftKind, ctx: GrowthContext): Promise<{ draft: DraftBody; image: Buffer | null }> {
  if (kind === "google_ads") return { draft: draftGoogleAds(ctx.facts, ctx.settings), image: null };
  if (kind === "website") return { draft: draftSite(ctx.facts, ctx.settings, ctx.licenseLine), image: null };
  const img = await makeAdImage();
  return { draft: draftMetaAds(ctx.facts, ctx.settings, img.source), image: img.jpeg };
}

/**
 * Saves a draft and queues it for her approval. A draft that fails the policy check
 * is never queued (PolicyBlocked), so it can never be exported.
 */
export async function saveAndQueue(kind: DraftKind, draft: DraftBody, image: Buffer | null, by: string): Promise<{ id: string; approvalId: string }> {
  if (!draft.check.ok) throw new PolicyBlocked(draft.check.findings.filter((f) => f.severity === "block"));
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.growth_drafts (kind, draft, image_jpeg, status, policy_ok, created_by, is_sample)
    values (${kind}, ${db().json(draft as never)}, ${image}, 'pending_approval', true, ${by}, ${draft.isSample})
    returning id`;
  const approvalKind = kind === "website" ? "website" : "ads_campaign";
  const preview =
    kind === "website"
      ? { body: `${(draft as SiteDraft).title}. Approve it to download the site files. Nothing is published.`, url: (draft as SiteDraft).url }
      : {
          body:
            kind === "google_ads"
              ? `Google Search campaign, paused. ${(draft as GoogleAdsDraft).adGroup.keywords.length} keywords, ${(draft as GoogleAdsDraft).ad.headlines.length} headlines. Approve it to download the Google Ads Editor file. Nothing is spent.`
              : `Facebook and Instagram ads, paused. ${(draft as MetaAdsDraft).ads.length} ads. Approve it to download the spec and picture. Nothing is spent.`,
          monthly_cap: (draft as GoogleAdsDraft | MetaAdsDraft).campaign.monthlyCapCents,
          ...(kind === "meta_ads" ? { image: `/api/growth/drafts/${row.id}/image` } : {}),
        };
  const approvalId = await queueApproval({
    kind: approvalKind,
    title: `${draft.isSample ? "[Sample] " : ""}${TITLES[kind]}`,
    preview,
    payload: { draft_id: row.id, kind },
    createdBy: by,
  });
  await db()`update practice_os.growth_drafts set approval_id = ${approvalId} where id = ${row.id}`;
  return { id: row.id, approvalId };
}

export async function draftAndQueue(kind: DraftKind, by: string): Promise<{ id: string; approvalId: string; draft: DraftBody }> {
  const ctx = await loadGrowthContext();
  const { draft, image } = await buildDraft(kind, ctx);
  const r = await saveAndQueue(kind, draft, image, by);
  return { ...r, draft };
}

export async function getDraft(id: string): Promise<DraftRow | null> {
  const [r] = await db()<DraftRow[]>`
    select d.id, d.kind, d.draft, d.status, d.policy_ok, d.approval_id, a.status as approval_status,
           d.image_jpeg is not null as has_image, d.is_sample, d.created_at
      from practice_os.growth_drafts d left join practice_os.approvals a on a.id = d.approval_id
     where d.id = ${id}`;
  return r ?? null;
}

/** The newest draft of each kind. */
export async function latestDrafts(): Promise<Partial<Record<DraftKind, DraftRow>>> {
  const rows = await db()<DraftRow[]>`
    select distinct on (d.kind) d.id, d.kind, d.draft, d.status, d.policy_ok, d.approval_id, a.status as approval_status,
           d.image_jpeg is not null as has_image, d.is_sample, d.created_at
      from practice_os.growth_drafts d left join practice_os.approvals a on a.id = d.approval_id
     order by d.kind, d.created_at desc`;
  return Object.fromEntries(rows.map((r) => [r.kind, r]));
}

export async function draftImage(id: string): Promise<Buffer | null> {
  const [r] = await db()<{ image_jpeg: Buffer | null }[]>`select image_jpeg from practice_os.growth_drafts where id = ${id}`;
  return r?.image_jpeg ? Buffer.from(r.image_jpeg) : null;
}

/** Ready means she approved it: the approval is done and the executor marked the draft. */
export const isReady = (r: Pick<DraftRow, "status" | "approval_status" | "policy_ok">) => r.status === "ready" && r.approval_status === "done" && r.policy_ok;

export async function markReady(draftId: string, approvalId: string): Promise<DraftRow> {
  const [r] = await db()<{ id: string }[]>`
    update practice_os.growth_drafts set status = 'ready', ready_at = now(), approval_id = ${approvalId}
     where id = ${draftId} and (approval_id is null or approval_id = ${approvalId}) and policy_ok and status = 'pending_approval'
     returning id`;
  if (!r) throw new Error("This draft is no longer waiting for approval.");
  await audit({ actor: "executor", action: "growth_draft_ready", approvalId, subjectType: "growth_draft", subjectId: draftId, details: { spent: 0, published: false, sent_to_ad_platform: false } });
  return (await getDraft(draftId))!;
}
