// Grow through the real tools, approvals and export route: drafts wait for her
// approval, exports stay locked until then, executors never spend or call an ad
// platform (DRY_RUN or not), and a draft that fails the policy check is never queued.
// Database tests: run only when DATABASE_URL is set (a throwaway local Postgres).
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { REFERRALS_ONLY_DEMO } from "../lib/features";

vi.mock("../lib/meta", async (orig) => {
  const real = await orig<typeof import("../lib/meta")>();
  return {
    ...real,
    generateImage: vi.fn(async () => ({
      response: {},
      image: await sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#E3E1D9" } }).png().toBuffer(),
    })),
  };
});

import { GET as exportRoute } from "../app/api/growth/drafts/[id]/export/route";
import { GET as imageRoute } from "../app/api/growth/drafts/[id]/image/route";
import { adsCampaign } from "../lib/executors/ads_campaign";
import { loadSavedGrowth, saveGrowth } from "../lib/growth/store";
import * as facts from "../lib/media/facts";
import { runTool } from "../lib/aeon/tools";
import { approve, decline } from "../lib/approvals";
import { closeDb, db } from "../lib/db";
import { draftGoogleAds } from "../lib/growth/ads";
import { loadGrowthContext, PolicyBlocked, saveAndQueue } from "../lib/growth/store";
import { generateImage } from "../lib/meta";

const hasDb = Boolean(process.env.DATABASE_URL);
const ctx = { by: "test:growth" };
const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text);

async function exportOf(id: string, as?: string, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  const req = new Request(`http://localhost/api/growth/drafts/${id}/export${as ? `?as=${as}` : ""}`, { headers });
  return exportRoute(req, { params: Promise.resolve({ id }) } as never);
}

async function imageOf(id: string, headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) {
  return imageRoute(new Request(`http://localhost/api/growth/drafts/${id}/image`, { headers }), { params: Promise.resolve({ id }) } as never);
}

beforeAll(() => {
  process.env.DRY_RUN = "true";
});

afterAll(async () => {
  if (!hasDb) return;
  await db()`delete from practice_os.growth_drafts where created_by = ${ctx.by}`;
  await closeDb();
});

describe.skipIf(REFERRALS_ONLY_DEMO || !hasDb)("Grow drafts, approvals and exports", () => {
  it("private_pay_plan answers with the [Sample] plan for the demo practice", async () => {
    const r = json(await runTool("private_pay_plan", {}, ctx));
    expect(r.headline).toBe("[Sample] You need 9 private-pay clients to replace BCBSIL: 7 more than you have now. 12-week plan.");
    expect(r.sample).toMatch(/\[Sample\]/);
    expect(r.panels.map((p: { payer: string }) => p.payer)).toEqual(["[Sample] BCBSIL", "[Sample] Aetna"]);
    expect(r.weekly_targets).toHaveLength(12);
  });

  it("private_pay_plan asks for a rate she hasn't given instead of guessing", async () => {
    const r = json(await runTool("private_pay_plan", { panels: [{ payer: "Cigna", weekly_sessions: 4 }] }, ctx));
    expect(r.asks.join(" ")).toMatch(/What does Cigna pay you/);
    expect(r.panels.find((p: { payer: string }) => p.payer === "Cigna").pays_per_session).toBe("unknown: ask her");
  });

  it("a panel she gives numbers for becomes hers; the sample panels she didn't touch stay labelled", async () => {
    const r = json(await runTool("private_pay_plan", { panels: [{ payer: "BCBSIL", weekly_sessions: 10 }] }, ctx));
    const bcbs = r.panels.find((p: { payer: string }) => p.payer === "BCBSIL");
    // her session count is kept; the sample rate is NOT kept as hers, it's asked for
    expect(bcbs).toMatchObject({ sessions_a_week: 10, pays_per_session: "unknown: ask her" });
    expect(r.panels.some((p: { payer: string }) => p.payer === "[Sample] Aetna")).toBe(true);
    expect(r.headline).toMatch(/^\[Sample\] /);
    expect(r.asks.join(" ")).toMatch(/What does BCBSIL pay you/);
  });

  it("numbers that don't fit come back as a plain error, never a thrown ZodError", async () => {
    const r = await runTool("private_pay_plan", { panels: [{ payer: "X", rate_dollars: 999.999, weekly_sessions: 59.999 }], private_fee_dollars: 999.995 }, ctx);
    expect(r.isError ?? false).toBe(false);
    const bad = await runTool("private_pay_plan", { current_private_weekly: 61 }, ctx);
    expect(bad.isError).toBe(true);
  });

  it("saves growth settings key by key; a bad value throws before writing and wipes nothing", async () => {
    await saveGrowth({ radius_miles: 7 });
    await saveGrowth({ site_url: "https://dana.example.com" });
    expect(await loadSavedGrowth()).toMatchObject({ radius_miles: 7, site_url: "https://dana.example.com" });
    await expect(saveGrowth({ monthly_cap_cents: 100 })).rejects.toThrow(/at least \$150/);
    expect(await loadSavedGrowth()).toMatchObject({ radius_miles: 7, site_url: "https://dana.example.com" });
    // one stored value that no longer fits hides only itself
    await db()`update practice_os.clinician_profile set onboarding_answers = jsonb_set(onboarding_answers, '{growth,radius_miles}', '"far"'::jsonb)`;
    expect(await loadSavedGrowth()).toEqual({ site_url: "https://dana.example.com" });
    await db()`update practice_os.clinician_profile set onboarding_answers = onboarding_answers - 'growth'`;
  });

  it("refuses a cap under $150 with a plain message", async () => {
    const r = await runTool("draft_google_ads", { monthly_cap_dollars: 100 }, ctx);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/at least \$150/);
  });

  it.each([["true"], ["false"]])("DRY_RUN=%s: Google draft waits for approval; approving unlocks the CSV and never calls Google", async (dry) => {
    process.env.DRY_RUN = dry;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = json(await runTool("draft_google_ads", {}, ctx));
    expect(r).toMatchObject({ queued: true, policy_check: "passed", monthly_cap: "[Sample] $300" });
    const [row] = await db()<{ id: string; status: string }[]>`select id, status from practice_os.growth_drafts where approval_id = ${r.approval_id}`;
    expect(row.status).toBe("pending_approval");

    const locked = await exportOf(row.id);
    expect(locked.status).toBe(409);
    // only the app's own page gets downloads
    expect((await exportOf(row.id, "csv", {})).status).toBe(403);
    expect((await exportOf(row.id, "csv", { "sec-fetch-site": "cross-site" })).status).toBe(403);

    const a = await approve(r.approval_id, { by: "clinician" });
    expect(a.ok && a.approval.status).toBe("done");
    expect(a.ok && a.approval.result).toMatchObject({ ready: true, spent: 0, published: false, sent_to_ad_platform: false });
    expect(fetchSpy).not.toHaveBeenCalled();

    const res = await exportOf(row.id, "csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toContain("sample-google-ads-editor.csv");
    const csv = await res.text();
    expect(csv).toContain("Paused");
    const [log] = await db()`select details from practice_os.audit_log where approval_id = ${r.approval_id} and action = 'growth_draft_ready'`;
    expect(log.details).toMatchObject({ spent: 0, published: false });
    fetchSpy.mockRestore();
    process.env.DRY_RUN = "true";
  });

  it("Meta draft makes its picture with Muse Image (mocked) and exports the spec and a 1080 JPEG after approval", async () => {
    const before = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key";
    try {
      const r = json(await runTool("draft_meta_ads", { monthly_cap_dollars: 250 }, ctx));
      expect(r).toMatchObject({ queued: true, monthly_cap: "$250" });
      expect(vi.mocked(generateImage)).toHaveBeenCalledWith("growth.meta_ad_image", expect.stringMatching(/no people/));
      const [row] = await db()<{ id: string }[]>`select id from practice_os.growth_drafts where approval_id = ${r.approval_id}`;
      expect((await exportOf(row.id, "image")).status).toBe(409);
      expect((await imageOf(row.id)).status).toBe(200);
      expect((await imageOf(row.id, { "sec-fetch-site": "cross-site" })).status).toBe(403);
      expect((await imageOf(row.id, {})).status).toBe(403);
      await approve(r.approval_id, { by: "clinician" });
      const spec = await (await exportOf(row.id, "json")).json();
      expect(spec.ad_set.detailed_targeting).toBe("none");
      const img = Buffer.from(await (await exportOf(row.id, "image")).arrayBuffer());
      const meta = await sharp(img).metadata();
      expect(meta).toMatchObject({ format: "jpeg", width: 1080, height: 1080, space: "srgb" });
    } finally {
      process.env.MODEL_API_KEY = before;
    }
  });

  it("asks for a cap instead of choosing one", async () => {
    await db()`update practice_os.clinician_profile set onboarding_answers = jsonb_set(onboarding_answers, '{growth}', '{"monthly_cap_cents": null}'::jsonb, true)`;
    try {
      const r = json(await runTool("draft_google_ads", {}, ctx));
      expect(r.needs_her).toMatch(/monthly budget cap/);
      expect(r.queued).toBeUndefined();
    } finally {
      await db()`update practice_os.clinician_profile set onboarding_answers = onboarding_answers - 'growth'`;
    }
  });

  it("website: queued, locked until approved, then a zip and Squarespace text", async () => {
    const r = json(await runTool("build_website", { booking_url: "https://cal.example.com/dana/consult" }, ctx));
    expect(r).toMatchObject({ queued: true, has_tracking: false });
    const [row] = await db()<{ id: string }[]>`select id from practice_os.growth_drafts where approval_id = ${r.approval_id}`;
    expect((await exportOf(row.id, "zip")).status).toBe(409);
    await approve(r.approval_id, { by: "clinician" });
    const zip = Buffer.from(await (await exportOf(row.id, "zip")).arrayBuffer());
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.toString("latin1")).toContain("llms.txt");
    const text = await (await exportOf(row.id, "squarespace")).text();
    expect(text).toContain("Dana Reyes, LCPC (fictional demo practice)");
    await db()`update practice_os.clinician_profile set onboarding_answers = onboarding_answers - 'growth'`;
  });

  it("a declined draft stays locked", async () => {
    const r = json(await runTool("build_website", {}, ctx));
    const [row] = await db()<{ id: string }[]>`select id from practice_os.growth_drafts where approval_id = ${r.approval_id}`;
    await decline(r.approval_id, { by: "clinician" });
    expect((await exportOf(row.id, "zip")).status).toBe(409);
  });

  it("never queues a draft that fails the policy check, and the database refuses a ready draft that failed it", async () => {
    const g = await loadGrowthContext();
    const d = draftGoogleAds(g.facts, g.settings);
    const bad = { ...d, ad: { ...d.ad, headlines: ["Guaranteed Results", ...d.ad.headlines.slice(1)] } };
    const { checkGoogleDraft } = await import("../lib/growth/ads");
    const checked = { ...bad, check: checkGoogleDraft(bad, g.facts) };
    const n = await db()`select count(*)::int as n from practice_os.approvals where kind = 'ads_campaign'`;
    await expect(saveAndQueue("google_ads", checked, null, ctx.by)).rejects.toBeInstanceOf(PolicyBlocked);
    const after = await db()`select count(*)::int as n from practice_os.approvals where kind = 'ads_campaign'`;
    expect(after[0].n).toBe(n[0].n);
    await expect(
      db()`insert into practice_os.growth_drafts (kind, draft, status, policy_ok, created_by) values ('google_ads', '{}', 'ready', false, ${ctx.by})`,
    ).rejects.toThrow(/check/);
  });

  it("the ads executor fails closed when her facts can't load", async () => {
    const r = json(await runTool("draft_google_ads", {}, ctx));
    const [row] = await db()<{ id: string }[]>`select id from practice_os.growth_drafts where approval_id = ${r.approval_id}`;
    const spy = vi.spyOn(facts, "loadMediaFacts").mockRejectedValueOnce(new Error("db down"));
    await expect(adsCampaign({ id: r.approval_id, payload: { draft_id: row.id } } as never, { dryRun: true })).rejects.toThrow(/Nothing was marked ready/);
    spy.mockRestore();
    const [after] = await db()`select status from practice_os.growth_drafts where id = ${row.id}`;
    expect(after.status).toBe("pending_approval");
  });

  it("the view-only demo copy refuses the drafting tools", async () => {
    const r = await runTool("draft_google_ads", {}, { ...ctx, viewOnly: true });
    expect(r.isError).toBe(true);
  });
});
