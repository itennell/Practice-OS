// Niche scoring (PR: referral-niche-scoring): her niche preset weights the
// specialty points (catalog default_points x category weight x type boost,
// clamped 0-35), a self-pay practice gets the session-capped boost, the
// "who you help" fail-closed rule still holds, sensitive kinds never get a pin
// or a street address, and the niche picker / set_referral_niche save and
// validate. Fake data only ([Sample]); the privacy guard is a pass-through here.
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));

import { loadEnv } from "../lib/env";
import { NICHE_PRESETS, SESSION_CAPPED_BOOST, SOURCE_TYPE_BY_ID } from "../lib/referrals/catalog";
import { REFERRAL_DEMO_SCREENS, REFERRAL_DEMO_TOOLS, toolEnabled } from "../lib/features";
import { pickNew } from "../lib/referrals/plan";
import { pinnable, PUBLIC_CONTACT_ONLY, sensitiveLocation, withoutStreet } from "../lib/referrals/sensitive";
import { NICHE_OPTIONS, specialtiesForNiche } from "../lib/referrals/settings";
import { SPECIALTY_BY_ID } from "../lib/referrals/nppes";
import { referralsQuestions } from "../lib/referrals/onboarding";
import {
  focusRank,
  NICHE_FIT,
  NICHE_WORDS,
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
// The same person in every way but their kind: distance, name, phone, fax, record age and state.
const person = (taxonomy: string): TierInput => ({
  taxonomy,
  npiType: "individual",
  name: "[Sample] Pat Example",
  phone: "312-555-0101",
  fax: "312-555-0102",
  lastUpdated: "2026-01-15",
  state: "IL",
});
// Dana's demo practice: adults and families, oncology / serious illness / end of life, self-pay.
const dana: TierContext = { miles: 1.2, focus: ["adults", "families"], clinicianState: "IL", today: new Date("2026-11-02"), niche: ONC, selfPay: true };

describe("niche scoring", () => {
  it("has a phrase for every catalog niche, and the picker lists them all", () => {
    for (const p of NICHE_PRESETS) expect(NICHE_WORDS[p.id], p.id).toBeTruthy();
    expect(NICHE_OPTIONS.map((o) => o.value)).toEqual(NICHE_PRESETS.map((p) => p.id));
  });

  it("without a niche keeps the plain specialty points", () => {
    const plain = tierFor(person(code("oncology")), { ...dana, niche: null, selfPay: false });
    const nicheNone = tierFor(person(code("oncology")), { ...dana, niche: "not_a_niche", selfPay: false });
    // oncology 22 + distance 25-6=19 + named 15 + phone 6 + fax 4 + fresh 10 + Illinois 5
    expect(plain.score).toBe(81);
    expect(nicheNone.score).toBe(plain.score);
    expect(plain.reasons.some((r) => r.startsWith(NICHE_FIT))).toBe(false);
  });

  it("the oncology preset ranks oncology, hospice, palliative care and genetic counselors above pediatrics", () => {
    const ped = tierFor(person(code("pediatrics")), dana);
    for (const kind of ["oncology", "hospice", "palliative_care", "genetic_counselors"]) {
      const r = tierFor(person(code(kind)), dana);
      expect(r.score, kind).toBeGreaterThan(ped.score);
      expect(focusRank(r), kind).toBeLessThan(focusRank(ped));
    }
    // Without the niche, pediatrics outscores oncology.
    const plain = { ...dana, niche: null, selfPay: false };
    expect(tierFor(person(code("pediatrics")), plain).score).toBeGreaterThan(tierFor(person(code("oncology")), plain).score);
  });

  it("clamps the niche points to 35 and names the niche and the category on the card", () => {
    const onc = tierFor(person(code("oncology")), { ...dana, selfPay: false });
    // 22 x 1.5 x 1.5 = 49.5, clamped to 35: 35 + 19 + 15 + 6 + 4 + 10 + 5 = 94
    expect(onc.score).toBe(94);
    expect(onc.category).toBe(2);
    expect(onc.reasons[1]).toBe("Fits your oncology & end-of-life focus (Medical specialists)");
    const ped = tierFor(person(code("pediatrics")), dana);
    expect(ped.reasons[1]).toBe("Primary care");
    const psych = tierFor(person("2084P0800X"), dana);
    expect(psych.reasons[1]).toMatch(/^Psychiatry and prescribers: less often a source for your oncology & end-of-life focus/);
  });

  it("the weekly plan puts the niche's kinds first", () => {
    const card = (id: string, taxonomy: string): ReferralSource =>
      ({ id, name: `[Sample] ${id}`, taxonomy, stage: "found", distance_miles: 1 }) as ReferralSource;
    const cards = [card("ped", code("pediatrics")), card("fam", "207Q00000X"), card("onc", code("oncology")), card("gen", code("genetic_counselors")), card("hos", code("hospice"))];
    const tiers: Record<string, TierResult> = Object.fromEntries(cards.map((c) => [c.id, tierFor(person(c.taxonomy!), dana)]));
    const { picked } = pickNew(cards, tiers, [], 3);
    expect(picked.map((c) => c.id).sort()).toEqual(["gen", "hos", "onc"]);
  });
});

describe("session-capped boost for a self-pay practice", () => {
  it("reads her fee and insurance stance", () => {
    // The demo seed's words and onboarding's INSURANCE_WORDS.
    expect(selfPayFrom("[Sample] Not in network yet; credentialing planned", "[Sample] Self-pay $150 per session")).toBe(true);
    expect(selfPayFrom("Self-pay only")).toBe(true);
    expect(selfPayFrom("Self-pay now, plans to take insurance")).toBe(true);
    expect(selfPayFrom("Takes some insurance", "Self-pay $150 per session")).toBe(false);
    expect(selfPayFrom(null, null)).toBe(false);
  });

  it("adds the catalog's points to a session-capped kind (hospice), only when she is self-pay", () => {
    expect(SESSION_CAPPED_BOOST).toBeGreaterThan(0);
    const ctx = { ...dana, niche: null };
    const self = tierFor(person(code("hospice")), { ...ctx, selfPay: true });
    const insured = tierFor(person(code("hospice")), { ...ctx, selfPay: false });
    expect(self.score - insured.score).toBe(SESSION_CAPPED_BOOST);
    expect(self.reasons).toContain(SESSION_CAPPED_REASON);
    expect(insured.reasons).not.toContain(SESSION_CAPPED_REASON);
    // Not session-capped: no boost.
    const onc = tierFor(person(code("oncology")), { ...ctx, selfPay: true });
    expect(onc.reasons).not.toContain(SESSION_CAPPED_REASON);
  });

  it("never goes past 100", () => {
    expect(tierFor({ ...person(code("hospice")) }, { ...dana, miles: 0 }).score).toBeLessThanOrEqual(100);
  });
});

describe("who you help still fails closed with a niche", () => {
  it("a kind with no 'who they see' stays Later even when the niche weights it up", async () => {
    vi.resetModules();
    vi.doMock("../lib/referrals/catalog", async (orig) => ({ ...(await orig<typeof import("../lib/referrals/catalog")>()), catalogSees: () => null }));
    const tier = await import("../lib/referrals/tier");
    // A doula: the perinatal niche boosts them (20 x 1.5 x 1.5, clamped to 35), but who they see is unknown here.
    const r = tier.tierFor(person("374J00000X"), { ...dana, miles: 0, focus: ["perinatal"], niche: "perinatal_reproductive" });
    expect(r.reasons.some((x) => x.startsWith(NICHE_FIT))).toBe(true);
    expect(r.tier).toBe("later");
    expect(r.reasons).toContain(UNKNOWN_SEES_REASON);
    expect(tier.focusRank(r)).toBe(4);
    vi.doUnmock("../lib/referrals/catalog");
    vi.resetModules();
  });

  it("a doula for a children-only practice stays Later under the perinatal niche", () => {
    const r = tierFor(person("374J00000X"), { ...dana, miles: 0, focus: ["children"], niche: "perinatal_reproductive" });
    expect(r.tier).toBe("later");
    expect(focusRank(r)).toBe(4);
  });

  it("a kind that sees only people she doesn't stays Later under a niche that boosts it", () => {
    const r = tierFor(person(code("pediatrics")), { ...dana, focus: ["older_adults"], niche: "children_teens_families" });
    expect(r.reasons.some((x) => x.startsWith(NICHE_FIT))).toBe(true);
    expect(r.tier).toBe("later");
    expect(focusRank(r)).toBe(4);
  });
});

describe("sensitive kinds: no pin, no street address", () => {
  it("marks DV/SA agencies and shelters sensitive, with their category", () => {
    for (const type of ["dv_sa_agencies", "shelters"]) {
      const r = tierFor({ taxonomy: null, npiType: "organization", sourceType: type }, { ...dana });
      expect(r.sensitive, type).toBe(true);
      expect(r.category, type).toBe(11);
    }
    expect(tierFor(person(code("oncology")), dana).sensitive).toBe(false);
  });

  it("drops their pins and street addresses and shows only the city", () => {
    const tier = tierFor({ taxonomy: null, npiType: "organization", sourceType: "dv_sa_agencies" }, dana);
    const safe = { npi: "1", address: "[Sample] 1 Hidden St", precision: "address" as const, tier };
    const open = { npi: "2", address: "[Sample] 2 Open Ave", precision: "address" as const, tier: tierFor(person(code("oncology")), dana) };
    expect(pinnable([safe, open]).map((p) => p.npi)).toEqual(["2"]);
    expect(withoutStreet(safe)).toMatchObject({ address: null, precision: "zip" });
    expect(withoutStreet(open).address).toBe("[Sample] 2 Open Ave");
    expect(sensitiveLocation("Chicago")).toBe(`Chicago · ${PUBLIC_CONTACT_ONLY}`);
    expect(sensitiveLocation(null)).toBe(PUBLIC_CONTACT_ONLY);
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

  it("asks for the niche before the kinds in the short onboarding, and refreshes the kinds after", () => {
    const ids = referralsQuestions.questions.map((q) => q.id);
    expect(ids.indexOf("niche")).toBeLessThan(ids.indexOf("specialties"));
    expect(REFERRAL_DEMO_SCREENS.indexOf("referrals:niche")).toBeLessThan(REFERRAL_DEMO_SCREENS.indexOf("referrals:specialties"));
    expect(referralsQuestions.questions.find((q) => q.id === "niche")?.refreshes).toEqual(["specialties"]);
  });

  it("set_referral_niche is a registered, data-changing tool on the demo allow-list", async () => {
    const { TOOLS } = await import("../lib/aeon/tools");
    const t = TOOLS.find((x) => x.name === "set_referral_niche");
    expect(t?.changesData).toBe(true);
    expect(REFERRAL_DEMO_TOOLS).toContain("set_referral_niche");
    expect(toolEnabled("set_referral_niche")).toBe(true);
  });
});

describe.skipIf(!hasDb)("niche picker saves (built-in database)", () => {
  let saved: { home_zip: string | null; specialties: string[]; niche_preset: string | null } | undefined;

  afterAll(async () => {
    const m = await import("../lib/db");
    if (saved) await m.db()`update practice_os.referral_settings set home_zip = ${saved.home_zip}, specialties = ${saved.specialties}, niche_preset = ${saved.niche_preset} where id`;
    await m.closeDb();
  });

  it("onboarding saves the niche and pre-selects its kinds; 'none' clears it; a bad id is refused", async () => {
    const m = await import("../lib/db");
    [saved] = await m.db()<{ home_zip: string | null; specialties: string[]; niche_preset: string | null }[]>`
      select home_zip, specialties, niche_preset from practice_os.referral_settings where id`;
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

  it("Settings › Referrals saves a niche through the route and refuses one not in the catalog", async () => {
    const { PUT } = await import("../app/api/settings/referrals/route");
    const put = (body: unknown) =>
      PUT(new Request("http://localhost:3000/api/settings/referrals", { method: "PUT", headers: { "content-type": "application/json", host: "localhost:3000" }, body: JSON.stringify(body) }));
    const ok = await put({ nichePreset: "grief_loss" });
    expect(ok.status).toBe(200);
    const bad = await put({ nichePreset: "Grief & loss" });
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as { error: string }).error).toMatch(/Pick a niche/);
    const { getReferralSettings } = await import("../lib/referrals/settings");
    expect((await getReferralSettings()).nichePreset).toBe("grief_loss");
  });

  it("the chat tool saves a niche, and a changed niche re-scores the board", async () => {
    const m = await import("../lib/db");
    const { runTool } = await import("../lib/aeon/tools");
    await m.db()`update practice_os.referral_sources set score_version = 4`;
    const r = await runTool("set_referral_niche", { niche: ONC }, { by: "chat:niche-test", mode: "manual", approved: true });
    const body = JSON.parse(r.content.at(-1)!.text) as { saved: boolean; niche: string; looks_for_first: string[] };
    expect(body.saved).toBe(true);
    expect(body.niche).toBe("Oncology / serious illness / end of life");
    expect(body.looks_for_first[0]).toBe("Oncology");
    const [left] = await m.db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_sources where score_version = 4`;
    expect(left.n).toBe(0);
    const facts = await (await import("../lib/referrals/store")).practiceFacts();
    expect(facts.niche).toBe(ONC);
  });
});
