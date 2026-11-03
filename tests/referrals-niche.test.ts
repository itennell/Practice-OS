// Niche scoring (PR: referral-niche-scoring): her niche preset weights the
// specialty points (catalog default_points x category weight x type boost,
// clamped 0-35), one order everywhere (tier, mismatch last, niche weight, fit,
// score, distance), a self-pay practice (from her real payer panels and fees)
// gets the session-capped boost before the clamp, the "who you help"
// fail-closed rule still holds, saved scores carry their niche, and the niche
// picker / set_referral_niche save and validate. Fake data only ([Sample]);
// the privacy guard is a pass-through here.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));

import { loadEnv } from "../lib/env";
import { NICHE_PRESETS, SESSION_CAPPED_BOOST, SOURCE_TYPE_BY_ID } from "../lib/referrals/catalog";
import { REFERRAL_DEMO_SCREENS, REFERRAL_DEMO_TOOLS, REFERRALS_ONLY_DEMO, toolEnabled } from "../lib/features";
import { pickNew, rankCards } from "../lib/referrals/plan";
import { NICHE_OPTIONS, specialtiesForNiche } from "../lib/referrals/settings";
import { SPECIALTY_BY_ID, type Provider } from "../lib/referrals/nppes";
import { referralsQuestions } from "../lib/referrals/onboarding";
import {
  boardTier,
  compareTiers,
  focusRank,
  NICHE_FIT,
  NICHE_WORDS,
  SCORE_VERSION,
  scoreVersionFor,
  selfPayFrom,
  SESSION_CAPPED_REASON,
  tierFor,
  UNKNOWN_SEES_REASON,
  type TierContext,
  type TierInput,
  type TierResult,
} from "../lib/referrals/tier";
import type { ReferralSource } from "../lib/referrals/store";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const ONC = "oncology_serious_illness";
const code = (type: string) => SOURCE_TYPE_BY_ID.get(type)!.nucc_codes![0];
// The same person in every way but their kind: name, phone, fax, record age and state.
const person = (taxonomy: string): TierInput => ({
  taxonomy,
  npiType: "individual",
  name: "[Sample] Pat Example",
  phone: "312-555-0101",
  fax: "312-555-0102",
  lastUpdated: "2026-01-15",
  state: "IL",
});
// A seed card: a group with no named contact and no phone, as db/seed/demo.sql has them.
const seedOrg = (taxonomy: string): TierInput => ({ taxonomy, npiType: "organization", state: "IL" });
// Dana's demo practice: adults and families, oncology / serious illness / end of life. In network with Aetna, so not self-pay.
const dana: TierContext = { miles: 1.2, focus: ["adults", "families"], clinicianState: "IL", today: new Date("2026-11-02"), niche: ONC, selfPay: false };

const at = (input: TierInput, miles: number, ctx: TierContext = dana) => ({ tier: tierFor(input, { ...ctx, miles }), miles });

describe("niche scoring", () => {
  it("has a phrase for every catalog niche, and the picker lists them all", () => {
    for (const p of NICHE_PRESETS) expect(NICHE_WORDS[p.id], p.id).toBeTruthy();
    expect(NICHE_OPTIONS.map((o) => o.value)).toEqual(NICHE_PRESETS.map((p) => p.id));
  });

  it("without a niche keeps the plain specialty points", () => {
    const plain = tierFor(person(code("oncology")), { ...dana, niche: null });
    const unknown = tierFor(person(code("oncology")), { ...dana, niche: "not_a_niche" });
    // oncology 22 + distance 25-6=19 + named 15 + phone 6 + fax 4 + fresh 10 + Illinois 5
    expect(plain.score).toBe(81);
    expect(unknown.score).toBe(plain.score);
    expect(plain.nicheWeight).toBeUndefined();
    expect(plain.reasons.some((r) => r.startsWith(NICHE_FIT))).toBe(false);
  });

  it("clamps the niche points to 35 and names the niche and the category on the card", () => {
    const onc = tierFor(person(code("oncology")), dana);
    // 22 x 1.5 x 1.5 = 49.5, clamped to 35: 35 + 19 + 15 + 6 + 4 + 10 + 5 = 94
    expect(onc.score).toBe(94);
    expect(onc.category).toBe(2);
    expect(onc.nicheWeight).toBe(2.25);
    expect(onc.reasons[1]).toBe("Fits your oncology & end-of-life focus (Medical specialists)");
    expect(tierFor(person(code("pediatrics")), dana).reasons[1]).toBe("Primary care");
    expect(tierFor(person("2084P0800X"), dana).reasons[1]).toMatch(/^Psychiatry and prescribers: less often a source for your oncology & end-of-life focus/);
  });

  it("Dana's seed geometry: oncology at 0.9 mi beats pediatrics at 0.3 mi and family medicine at 0.6 mi", () => {
    const onc = at(seedOrg(code("oncology")), 0.9);
    const ped = at(seedOrg(code("pediatrics")), 0.3);
    const fam = at(seedOrg("207Q00000X"), 0.6);
    // Same tier; pediatrics and family medicine even score higher on distance.
    expect(onc.tier.tier).toBe(ped.tier.tier);
    expect(onc.tier.tier).toBe(fam.tier.tier);
    expect(ped.tier.score).toBeGreaterThan(onc.tier.score);
    expect(fam.tier.score).toBeGreaterThan(onc.tier.score);
    expect(compareTiers(onc, ped)).toBeLessThan(0);
    // Family medicine's clamped points tie oncology's at 35; the niche's weight still puts oncology first.
    expect(compareTiers(onc, fam)).toBeLessThan(0);
    const sorted = [ped, fam, onc].sort(compareTiers);
    expect(sorted[0]).toBe(onc);
  });

  it("oncology, hospice, palliative care and genetic counselors all outrank pediatrics at unequal distances", () => {
    const ped = at(person(code("pediatrics")), 0.3);
    for (const kind of ["oncology", "hospice", "palliative_care", "genetic_counselors"]) {
      const r = at(person(code(kind)), 1.4);
      if (r.tier.tier === ped.tier.tier) expect(compareTiers(r, ped), kind).toBeLessThan(0);
      else expect(r.tier.tier, kind).toBe("first");
      expect(focusRank(r.tier), kind).toBeLessThan(focusRank(ped.tier));
    }
  });

  it("orders by tier first, then puts a 'not who you help' card last", () => {
    const later = at(person(code("pediatrics")), 0.1, { ...dana, focus: ["older_adults"] });
    const next = at(seedOrg("207Q00000X"), 2);
    const first = at(person("207Q00000X"), 0.1);
    expect([later, next, first].sort(compareTiers).map((x) => x.tier.tier)).toEqual(["first", "next", "later"]);
  });

  it("the weekly plan and the board rank the niche's kinds first", () => {
    const card = (id: string, taxonomy: string, miles: number): ReferralSource =>
      ({ id, name: `[Sample] ${id}`, taxonomy, stage: "found", distance_miles: miles, npi_type: "organization", state: "IL" }) as ReferralSource;
    const cards = [card("ped", code("pediatrics"), 0.3), card("fam", "207Q00000X", 0.6), card("onc", code("oncology"), 0.9), card("hos", code("hospice"), 1.8)];
    const tiers: Record<string, TierResult> = Object.fromEntries(cards.map((c) => [c.id, tierFor(seedOrg(c.taxonomy!), { ...dana, miles: c.distance_miles })]));
    expect(rankCards(cards, tiers).map((c) => c.id).slice(0, 2)).toEqual(["onc", "hos"]);
    expect(pickNew(cards, tiers, [], 2).picked.map((c) => c.id)).toEqual(["onc", "hos"]);
  });
});

describe("session-capped boost for a self-pay practice", () => {
  it("reads her real settings: in network with any payer is never self-pay", () => {
    expect(selfPayFrom({ inNetwork: 1, insurance: "Self-pay only", hasFees: true })).toBe(false);
    expect(selfPayFrom({ inNetwork: 0, insurance: "Self-pay only", hasFees: false })).toBe(true);
    expect(selfPayFrom({ inNetwork: 0, insurance: "Self-pay now, plans to take insurance", hasFees: true })).toBe(true);
    expect(selfPayFrom({ inNetwork: 0, insurance: "Takes some insurance", hasFees: true })).toBe(false);
    expect(selfPayFrom({ inNetwork: 0, insurance: null, hasFees: true })).toBe(true);
    expect(selfPayFrom({ inNetwork: 0, insurance: null, hasFees: false })).toBe(false);
  });

  it("adds the catalog's points to a session-capped kind (hospice) before the 35 cap", () => {
    expect(SESSION_CAPPED_BOOST).toBeGreaterThan(0);
    const ctx = { ...dana, niche: null };
    const self = tierFor(person(code("hospice")), { ...ctx, selfPay: true });
    const insured = tierFor(person(code("hospice")), { ...ctx, selfPay: false });
    // 20 + 8 = 28, under the cap.
    expect(self.score - insured.score).toBe(SESSION_CAPPED_BOOST);
    expect(self.reasons).toContain(SESSION_CAPPED_REASON);
    expect(insured.reasons).not.toContain(SESSION_CAPPED_REASON);
    // Under the oncology niche hospice is already at 35: the boost can't lift it past the cap.
    const capped = tierFor(person(code("hospice")), { ...dana, selfPay: true });
    expect(capped.score).toBe(tierFor(person(code("hospice")), { ...dana, selfPay: false }).score);
    // Not session-capped: no boost.
    expect(tierFor(person(code("oncology")), { ...ctx, selfPay: true }).reasons).not.toContain(SESSION_CAPPED_REASON);
  });

  it("never lifts a card that doesn't see who she helps", () => {
    const ctx = { ...dana, niche: null, focus: ["children" as const] };
    const self = tierFor(person(code("hospice")), { ...ctx, selfPay: true });
    const insured = tierFor(person(code("hospice")), { ...ctx, selfPay: false });
    expect(self.tier).toBe("later");
    expect(self.score).toBe(insured.score);
    expect(self.reasons).not.toContain(SESSION_CAPPED_REASON);
  });
});

describe("who you help still fails closed with a niche", () => {
  it("a kind with no 'who they see' stays Later even when the niche weights it up", async () => {
    vi.resetModules();
    vi.doMock("../lib/referrals/catalog", async (orig) => ({ ...(await orig<typeof import("../lib/referrals/catalog")>()), catalogSees: () => null }));
    const tier = await import("../lib/referrals/tier");
    // A doula: the perinatal niche boosts them (20 x 1.5 x 1.5, clamped to 35), but who they see is unknown here.
    const r = tier.tierFor(person("374J00000X"), { ...dana, miles: 0, focus: ["perinatal"], niche: "perinatal_reproductive", selfPay: true });
    expect(r.reasons.some((x) => x.startsWith(NICHE_FIT))).toBe(true);
    expect(r.tier).toBe("later");
    expect(r.reasons).toContain(UNKNOWN_SEES_REASON);
    expect(tier.focusRank(r)).toBe(4);
    vi.doUnmock("../lib/referrals/catalog");
    vi.resetModules();
  });

  it("a kind known only from the catalog (no NPI Registry specialty) fails closed when she has a focus", async () => {
    vi.resetModules();
    const hospice = SOURCE_TYPE_BY_ID.get("hospice")!;
    // The catalog knows the code's type, with no "who they see"; NPPES has no specialty for it.
    vi.doMock("../lib/referrals/catalog", async (orig) => ({
      ...(await orig<typeof import("../lib/referrals/catalog")>()),
      typeForCode: (c: string) => (c === "999TEST00X" ? { ...hospice, id: "sample_kind", sees: undefined } : undefined),
    }));
    const tier = await import("../lib/referrals/tier");
    const r = tier.tierFor({ taxonomy: "999TEST00X", npiType: "organization" }, { ...dana, miles: 0.2, selfPay: true });
    expect(r.specialty).toBeNull();
    expect(r.tier).toBe("later");
    expect(r.reasons).toContain(UNKNOWN_SEES_REASON);
    expect(r.reasons).not.toContain(SESSION_CAPPED_REASON);
    // With no focus there is nothing to match against.
    expect(tier.tierFor({ taxonomy: "999TEST00X", npiType: "organization" }, { ...dana, miles: 0.2, focus: [] }).reasons).not.toContain(UNKNOWN_SEES_REASON);
    vi.doUnmock("../lib/referrals/catalog");
    vi.resetModules();
  });

  it("a kind that sees only people she doesn't stays Later under a niche that boosts it", () => {
    const r = tierFor(person(code("pediatrics")), { ...dana, focus: ["older_adults"], niche: "children_teens_families" });
    expect(r.reasons.some((x) => x.startsWith(NICHE_FIT))).toBe(true);
    expect(r.tier).toBe("later");
    expect(focusRank(r)).toBe(4);
  });
});

describe("saved scores carry their niche", () => {
  it("gives each niche its own score_version, in a smallint", () => {
    expect(scoreVersionFor(null)).toBe(SCORE_VERSION);
    expect(scoreVersionFor("not_a_niche")).toBe(SCORE_VERSION);
    const versions = NICHE_PRESETS.map((p) => scoreVersionFor(p.id));
    expect(new Set(versions).size).toBe(NICHE_PRESETS.length);
    for (const v of versions) expect(v).toBeLessThanOrEqual(32767);
    expect(versions).not.toContain(SCORE_VERSION);
  });

  it("the board uses a saved score only when it was written for her current niche", () => {
    const card = {
      taxonomy: code("oncology"), npi_type: "organization" as const, phone: null, state: "IL", address: null, distance_miles: 0.9, fit_score: 99,
      score_version: scoreVersionFor("grief_loss"),
    };
    expect(boardTier(card, dana).score).not.toBe(99);
    expect(boardTier({ ...card, score_version: scoreVersionFor(ONC) }, dana).score).toBe(99);
  });
});

describe("niche picker", () => {
  it("picks the niche's top NPI Registry kinds, oncology first", () => {
    const kinds = specialtiesForNiche(ONC);
    expect(kinds.slice(0, 4).sort()).toEqual(["genetic_counselors", "hospice", "oncology", "palliative_care"]);
    expect(kinds.length).toBeLessThanOrEqual(6);
    for (const k of kinds) expect(SPECIALTY_BY_ID.has(k)).toBe(true);
    expect(specialtiesForNiche("not_a_niche")).toEqual([]);
  });

  it("asks for the niche before the kinds, only on the referrals-only short path", () => {
    const ids = referralsQuestions.questions.map((q) => q.id);
    expect(ids.indexOf("niche")).toBeLessThan(ids.indexOf("specialties"));
    const niche = referralsQuestions.questions.find((q) => q.id === "niche")!;
    expect(niche.refreshes).toEqual(["specialties"]);
    // Gated on the flag, so the full interview is unchanged with it off.
    expect(niche.appliesWhen?.({ state: "IL", credential: "LCPC", practiceStage: "beginning", officeZip: "60614", telehealth: false })).toBe(REFERRALS_ONLY_DEMO);
    expect(Object.keys(niche)).not.toContain("appliesWhen");
    expect(REFERRAL_DEMO_SCREENS.indexOf("referrals:niche")).toBeLessThan(REFERRAL_DEMO_SCREENS.indexOf("referrals:specialties"));
  });

  it("set_referral_niche is a registered, data-changing tool on the demo allow-list that queues over MCP", async () => {
    const { TOOLS } = await import("../lib/aeon/tools");
    const t = TOOLS.find((x) => x.name === "set_referral_niche");
    expect(t?.changesData).toBe(true);
    expect(t?.queuesOverMcp).toBe(true);
    expect(REFERRAL_DEMO_TOOLS).toContain("set_referral_niche");
    expect(toolEnabled("set_referral_niche")).toBe(true);
  });
});

describe.skipIf(!hasDb)("niche picker saves, and scores can't race a niche change (built-in database)", () => {
  type Saved = { home_zip: string | null; specialties: string[]; niche_preset: string | null };
  let saved: Saved | undefined;
  const NPIS = ["1999990001", "1999990002", "1999990003", "1999990004", "1999990005", "1999990006"];

  afterAll(async () => {
    const m = await import("../lib/db");
    await m.db()`delete from practice_os.referral_sources where npi in ${m.db()(NPIS)}`;
    if (saved) await m.db()`update practice_os.referral_settings set home_zip = ${saved.home_zip}, specialties = ${saved.specialties}, niche_preset = ${saved.niche_preset} where id`;
    await m.closeDb();
  });

  it("onboarding saves the niche and pre-selects its kinds; 'none' clears it; a bad id is refused", async () => {
    const m = await import("../lib/db");
    await m.db()`insert into practice_os.referral_settings (id, home_zip, specialties) values (true, '60614', ${["family_medicine"]}) on conflict (id) do nothing`;
    [saved] = await m.db()<Saved[]>`select home_zip, specialties, niche_preset from practice_os.referral_settings where id`;
    const { getReferralSettings } = await import("../lib/referrals/settings");
    await referralsQuestions.save({ niche: ONC });
    let s = await getReferralSettings();
    expect(s.nichePreset).toBe(ONC);
    expect(s.specialties).toEqual(specialtiesForNiche(ONC));
    expect((await referralsQuestions.load({ state: "IL", credential: "LCPC", practiceStage: "beginning", officeZip: "60614", telehealth: false })).niche).toBe(ONC);
    await referralsQuestions.save({ niche: "none" });
    s = await getReferralSettings();
    expect(s.nichePreset).toBeNull();
    expect(s.specialties).toEqual(specialtiesForNiche(ONC));
    await expect(referralsQuestions.save({ niche: "not_a_niche" })).rejects.toThrow(/Pick a niche/);
  });

  it("Settings › Referrals saves a niche and keeps her kinds unless asked, and refuses a niche not in the catalog", async () => {
    const { PUT } = await import("../app/api/settings/referrals/route");
    const { getReferralSettings, saveReferralSettings } = await import("../lib/referrals/settings");
    await saveReferralSettings({ specialties: ["pediatrics"] });
    const put = (body: unknown) =>
      PUT(new Request("http://localhost:3000/api/settings/referrals", { method: "PUT", headers: { "content-type": "application/json", host: "localhost:3000" }, body: JSON.stringify(body) }));
    expect((await put({ nichePreset: "grief_loss" })).status).toBe(200);
    expect(await getReferralSettings()).toMatchObject({ nichePreset: "grief_loss", specialties: ["pediatrics"] });
    expect((await put({ nichePreset: ONC, specialties: specialtiesForNiche(ONC) })).status).toBe(200);
    expect((await getReferralSettings()).specialties).toEqual(specialtiesForNiche(ONC));
    const bad = await put({ nichePreset: "Grief & loss" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/Pick a niche/);
  });

  it("the chat tool saves a niche and keeps her kinds by default", async () => {
    const { runTool } = await import("../lib/aeon/tools");
    const { getReferralSettings, saveReferralSettings } = await import("../lib/referrals/settings");
    await saveReferralSettings({ specialties: ["pediatrics"], nichePreset: null });
    const r = await runTool("set_referral_niche", { niche: ONC }, { by: "chat:niche-test", mode: "manual", approved: true });
    const body = JSON.parse(r.content.at(-1)!.text) as { saved: boolean; niche: string; looks_for_first?: string[] };
    expect(body).toMatchObject({ saved: true, niche: "Oncology / serious illness / end of life" });
    expect(body.looks_for_first).toBeUndefined();
    expect(await getReferralSettings()).toMatchObject({ nichePreset: ONC, specialties: ["pediatrics"] });
    const switched = await runTool("set_referral_niche", { niche: ONC, keep_kinds: false }, { by: "chat:niche-test", mode: "manual", approved: true });
    expect((JSON.parse(switched.content.at(-1)!.text) as { looks_for_first: string[] }).looks_for_first[0]).toBe("Oncology");
    expect((await (await import("../lib/referrals/store")).practiceFacts()).niche).toBe(ONC);
  });

  it("self-pay comes from her payer panels and fee schedule, not her onboarding fees text", async () => {
    const m = await import("../lib/db");
    const { practiceFacts } = await import("../lib/referrals/store");
    const [profile] = await m.db()<{ id: string; fee_schedule: unknown; answers: Record<string, unknown> }[]>`
      select id, fee_schedule, onboarding_answers as answers from practice_os.clinician_profile limit 1`;
    if (!profile) return; // the throwaway database may have no profile; the plain-code rule is tested above
    const approved = await m.db()<{ id: string }[]>`update practice_os.payer_applications set status = 'preparing' where status = 'approved' returning id`;
    try {
      // Her onboarding fees text says nothing; her fee schedule and "Do you take insurance?" do.
      await m.db()`update practice_os.clinician_profile set fee_schedule = ${m.db().json([{ code: "90834", label: "[Sample] Therapy", cents: 15000 }])},
        onboarding_answers = onboarding_answers - 'fees' || ${m.db().json({ insurance: "Self-pay only" })} where id = ${profile.id}`;
      expect((await practiceFacts()).selfPay).toBe(true);
      // In network with Aetna: not self-pay, whatever else she said.
      await m.db()`insert into practice_os.payer_applications (payer, status, applied_on, approved_on, is_sample) values ('[Sample] Aetna niche test', 'approved', '2026-01-12', '2026-03-16', true)`;
      expect((await practiceFacts()).selfPay).toBe(false);
    } finally {
      await m.db()`delete from practice_os.payer_applications where payer = '[Sample] Aetna niche test'`;
      if (approved.length) await m.db()`update practice_os.payer_applications set status = 'approved' where id in ${m.db()(approved.map((a) => a.id))}`;
      await m.db()`update practice_os.clinician_profile set fee_schedule = ${m.db().json(profile.fee_schedule as never)}, onboarding_answers = ${m.db().json(profile.answers as never)} where id = ${profile.id}`;
    }
  });

  it("a search saved after she changed niche isn't marked current; rescoring runs 4 at a time, once, and drops writes for an old niche", async () => {
    const m = await import("../lib/db");
    const store = await import("../lib/referrals/store");
    const { saveReferralSettings } = await import("../lib/referrals/settings");
    await saveReferralSettings({ nichePreset: ONC });
    const provider = (npi: string): Provider =>
      ({
        npi, name: `[Sample] Niche Test ${npi.slice(-1)}`, organization: null, taxonomy: code("oncology"), specialty: "oncology", specialtyLabel: "Oncology",
        npiType: "individual", credential: "MD", address: "[Sample] 1 Test St", city: "Chicago", state: "IL", zip: "60614", phone: null, fax: null,
        official: null, lastUpdated: "2026-01-01", homeAddress: false,
      }) as unknown as Provider;
    // Weighted for grief & loss while her niche is now oncology: saved, but not as current.
    await store.saveSources([{ ...provider(NPIS[0]), distanceMiles: 1, fitScore: 50, scoreVersion: scoreVersionFor("grief_loss") }]);
    const [stale] = await m.db()<{ score_version: number }[]>`select score_version from practice_os.referral_sources where npi = ${NPIS[0]}`;
    expect(stale.score_version).toBe(0);
    for (const npi of NPIS.slice(1)) await store.saveSources([{ ...provider(npi), distanceMiles: 1, fitScore: 50, scoreVersion: 0 }]);
    await m.db()`update practice_os.referral_sources set score_version = 0 where npi in ${m.db()(NPIS)}`;

    let running = 0;
    let most = 0;
    let calls = 0;
    const lookup = async (npi: string) => {
      calls++;
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return NPIS.includes(npi) ? provider(npi) : null;
    };
    const one = store.rescoreOldCards(m.db(), lookup, 500);
    const two = store.rescoreOldCards(m.db(), lookup, 500);
    expect(two).toBe(one);
    await one;
    expect(most).toBeLessThanOrEqual(store.RESCORE_CONCURRENCY);
    expect(most).toBeGreaterThan(1);
    const rows = await m.db()<{ score_version: number }[]>`select score_version from practice_os.referral_sources where npi in ${m.db()(NPIS)}`;
    for (const r of rows) expect(r.score_version).toBe(scoreVersionFor(ONC));
    expect(calls).toBeGreaterThanOrEqual(NPIS.length);

    // She changes niche while a rescore is running: its writes for the old niche are dropped.
    await m.db()`update practice_os.referral_sources set score_version = 0 where npi in ${m.db()(NPIS)}`;
    let switching: Promise<void> | null = null;
    const slow = async (npi: string) => {
      // Every lookup waits until her niche has changed, as if NPPES were slow.
      switching ??= saveReferralSettings({ nichePreset: "grief_loss" });
      await switching;
      return NPIS.includes(npi) ? provider(npi) : null;
    };
    await store.rescoreOldCards(m.db(), slow, 500);
    const after = await m.db()<{ score_version: number }[]>`select score_version from practice_os.referral_sources where npi in ${m.db()(NPIS)}`;
    for (const r of after) expect(r.score_version).not.toBe(scoreVersionFor(ONC));
    await saveReferralSettings({ nichePreset: ONC });
  });
});
