// Referrals › Partners (the calm CRM): the table's rows, search, filters and sort,
// the next-step line, and the call script (plain code, value-checked, no model call).
import { describe, expect, it } from "vitest";
import { buildCallScript, listWords, possessive, SCRIPT_VARIANTS, spokenPayer, type ScriptFacts } from "../lib/referrals/call-script";
import { DEFAULT_FILTERS, filterPartners, kindOptions, letterIsWaiting, nextStep, partnerRows, stageOptions } from "../lib/referrals/partners";
import type { ReferralSource } from "../lib/referrals/store";
import type { TierResult } from "../lib/referrals/tier";
import { valueOffered } from "../lib/referrals/value-check";

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine", npi_type: "individual",
  credential: "MD", address: null, city: "Chicago", state: "IL", zip: "60614", phone: null, email: null, stage: "found", distance_miles: 0.5,
  fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null, notes: null, is_sample: true, ...over,
});
const tier = (category: number | null): TierResult => ({ tier: "first", score: 50, reasons: ["x"], specialty: null, category });

const cards = [
  card({ id: "a", name: "[Sample] Juniper Row Family Medicine", distance_miles: 0.6, stage: "found", email: "frontdesk@example.com" }),
  card({ id: "b", name: "[Sample] Thistlewood OB-GYN", distance_miles: 2.4, stage: "follow_up", zip: "60657" }),
  card({ id: "c", name: "[Sample] Fernhollow Pediatrics", distance_miles: 4, stage: "connected" }),
  card({ id: "d", name: "[Sample] Set Aside Clinic", distance_miles: 1, stage: "not_a_fit" }),
];
const tiers = { a: tier(1), b: tier(2), c: tier(1), d: tier(3) };
const rows = partnerRows(cards, tiers, { c: [{ id: "x", kind: "met", happened_on: "2026-10-01" } as never] }, { b: "hello@thistle.example" });

describe("partners table", () => {
  it("one row per card: the found email, the kind's name and the last contact", () => {
    expect(rows.map((r) => r.email)).toEqual(["frontdesk@example.com", "hello@thistle.example", null, null]);
    expect(rows[0].kind).toBe("Primary care");
    expect(rows[2].lastContact).toBe("2026-10-01");
  });

  it("hides Not a fit unless she asks, and keeps the board's order", () => {
    expect(filterPartners(rows, DEFAULT_FILTERS).map((r) => r.card.id)).toEqual(["a", "b", "c"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, showNotAFit: true }).map((r) => r.card.id)).toEqual(["a", "b", "c", "d"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, stages: ["not_a_fit"] }).map((r) => r.card.id)).toEqual(["d"]);
  });

  it("searches name, ZIP and email; filters by kind, email and distance", () => {
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, query: "thistle" }).map((r) => r.card.id)).toEqual(["b"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, query: "60657" }).map((r) => r.card.id)).toEqual(["b"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, kinds: ["Primary care"] }).map((r) => r.card.id)).toEqual(["a", "c"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, email: "missing" }).map((r) => r.card.id)).toEqual(["c"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, email: "has" }).map((r) => r.card.id)).toEqual(["a", "b"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, distance: "3" }).map((r) => r.card.id)).toEqual(["a", "b"]);
  });

  it("sorts by name, distance, stage and the longest since contact", () => {
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, sort: "name" }).map((r) => r.card.id)).toEqual(["c", "a", "b"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, sort: "nearest" }).map((r) => r.card.id)).toEqual(["a", "b", "c"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, sort: "last_contact" }).map((r) => r.card.id)).toEqual(["a", "b", "c"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, sort: "stage" }).map((r) => r.card.id)).toEqual(["a", "b", "c"]);
  });

  it("menus list only what is on her board, with counts", () => {
    expect(kindOptions(rows).map((o) => [o.label, o.count])).toEqual([["Primary care", 2], ["Medical specialists", 1], [expect.any(String), 1]]);
    expect(stageOptions(rows, false).map((o) => o.value)).not.toContain("not_a_fit");
    expect(stageOptions(rows, true).find((o) => o.value === "not_a_fit")?.count).toBe(1);
  });

  it("the next step in plain words", () => {
    const today = "2026-11-03";
    expect(nextStep(cards[0], { email: "x@y.example", letterWaiting: false, cold: false, today })).toMatch(/^Draft a short introduction letter/);
    expect(nextStep(cards[2], { email: null, letterWaiting: false, cold: true, today })).toMatch(/^Going cold/);
    expect(nextStep(cards[0], { email: null, letterWaiting: true, cold: false, today })).toMatch(/waiting/);
    expect(nextStep(card({ next_follow_up_on: "2026-11-01", stage: "contacted" }), { email: null, letterWaiting: false, cold: false, today })).toMatch(/^Follow up now/);
    expect(letterIsWaiting({ approvalId: "1", status: "done", subject: null, letter: null, sent: false })).toBe(true);
    expect(letterIsWaiting({ approvalId: "1", status: "done", subject: null, letter: null, sent: true })).toBe(false);
  });
});

const facts: ScriptFacts = {
  name: "Dana Reyes", credential: "LCPC", practice: "Reyes Counseling PLLC", place: "Lincoln Park, Chicago", phone: "(312) 555-0100", email: "dana@example.com",
  niche: "people grieving a loss", whoSheHelps: ["adults", "couples"], inNetwork: ["Blue Cross Blue Shield of Illinois"], appliedPending: ["Aetna"],
  privatePay: true, slidingScale: true, telehealth: true, isSample: true,
};
const partner = { name: "[Sample] Dr. Ana Tellez, MD", greeting: "Dr. Tellez" };

describe("call script", () => {
  it("has the four sections in each version, with her niche, insurance and the ask", () => {
    for (const v of SCRIPT_VARIANTS) {
      const s = buildCallScript(facts, partner, v.id);
      expect(s.sections.map((x) => x.id)).toEqual(["open", "who", "ask", "write_down"]);
      expect(s.left_out).toBe(0);
    }
    const front = buildCallScript(facts, partner, "front_desk");
    expect(front.text).toContain("Dana Reyes, LCPC with Reyes Counseling PLLC in Lincoln Park, Chicago");
    expect(front.text).toContain("I work with people grieving a loss.");
    expect(front.text).toContain("I'm in network with Blue Cross Blue Shield of Illinois.");
    // A pending application is never said aloud on a call.
    expect(front.text).not.toMatch(/pending|Aetna/);
    expect(front.text).toContain("If you have someone in mind, I can tell you today how soon I can see them.");
    expect(front.text).toContain("How do you usually refer for counseling?");
    expect(front.sections[3].lines).toEqual(["Who handles referrals:", "How they refer (fax, portal, email or phone):", "Best time to call:"]);
    expect(buildCallScript(facts, partner, "provider").text).toContain("Hi Dr. Tellez,");
    expect(buildCallScript(facts, partner, "voicemail").text).toContain("You can reach me at (312) 555-0100 or dana@example.com.");
  });

  it("never offers anything of value: every line passes the value check", () => {
    for (const v of SCRIPT_VARIANTS) {
      for (const sec of buildCallScript(facts, partner, v.id).sections) for (const l of sec.lines) expect(valueOffered(l, { speaker: "her" }), l).toBeNull();
    }
  });

  it("leaves out a line that would offer something (a setting that slipped through)", () => {
    const s = buildCallScript({ ...facts, niche: "people grieving a loss, and I'll send a gift card for each patient you send" }, partner, "front_desk");
    expect(s.left_out).toBeGreaterThan(0);
    expect(s.text).not.toMatch(/gift card/i);
  });

  it("works with nothing set up yet", () => {
    const empty: ScriptFacts = { name: null, credential: null, practice: null, place: null, phone: null, email: null, niche: null, whoSheHelps: [], inNetwork: [], appliedPending: [], privatePay: false, slidingScale: null, telehealth: false, isSample: true };
    const s = buildCallScript(empty, { name: "X", greeting: "the X team", organization: true }, "voicemail");
    expect(s.text).toContain("Hi, this is a therapist.");
    expect(s.text).toContain("I'll try you again later this week.");
    expect(listWords(["a", "b", "c"])).toBe("a, b and c");
  });
});

describe("Ask Aeon context", async () => {
  const { withContext, contextSuffix, CHAT_MAX, NAME_MAX } = await import("../lib/referrals/ask-context");
  it("sends the picked partners as a quoted JSON list, control characters out, names capped", () => {
    const long = "[Sample] " + "A".repeat(200);
    const out = withContext("Who first?", "Partners", [
      { id: "c1", name: "[Sample] Juniper\nRow\u0000 Family Medicine" },
      { id: "c2", name: long },
    ]);
    expect(out.startsWith("Who first?\n\n(Asked from Referrals › Partners. Partners I picked: [")).toBe(true);
    const list = JSON.parse(out.slice(out.indexOf("["), out.lastIndexOf("]") + 1)) as { id: string; name: string }[];
    expect(list[0]).toEqual({ id: "c1", name: "[Sample] Juniper Row Family Medicine" });
    expect(list[1].name.length).toBe(NAME_MAX);
    expect(out).not.toMatch(/\u0000/);
  });

  it("cuts her words, never the context, to fit the chat's limit", () => {
    const picked = [{ id: "c1", name: "[Sample] Juniper Row Family Medicine" }];
    const out = withContext("x".repeat(5000), "Partners", picked);
    expect(out.length).toBe(CHAT_MAX);
    expect(out.endsWith(contextSuffix("Partners", picked))).toBe(true);
    expect(withContext("Hi", "Board", [])).toBe("Hi\n\n(Asked from Referrals › Board.)");
  });
});

describe("real-use sweep fixes", () => {
  it("one stage vocabulary: rows, the Stage menu and its filter use the Board's columns", () => {
    expect(rows.map((r) => r.column)).toEqual(["found", "reached_out", "met", "not_a_fit"]);
    expect(stageOptions(rows, true).map((o) => o.label)).toEqual(["Found", "Reached out", "Met", "Referring", "Not a fit"]);
    expect(filterPartners(rows, { ...DEFAULT_FILTERS, stages: ["met"] }).map((r) => r.card.id)).toEqual(["c"]);
    const referred = partnerRows([card({ id: "r", stage: "connected" })], {}, { r: [{ id: "k", kind: "referred", happened_on: "2026-10-30" } as never] }, {});
    expect(referred[0].column).toBe("referring");
  });

  it("Kind: the specialty Aeon knows wins, and every kind on the board is in the menu", () => {
    const pall = card({ id: "p", specialty: "Hospice and Palliative Medicine", taxonomy: "207RH0002X" });
    const home = card({ id: "h", specialty: "Home Health", taxonomy: "251E00000X", npi_type: "organization" });
    const r = partnerRows([pall, home], { p: { ...tier(5), specialty: "palliative_care" }, h: { ...tier(null), specialty: null } }, {}, {});
    expect(r.map((x) => x.kind)).toEqual(["Palliative care", "Home Health"]);
    expect(kindOptions(r).map((o) => o.label).sort()).toEqual(["Home Health", "Palliative care"]);
    expect(kindOptions(r).reduce((n, o) => n + o.count, 0)).toBe(2);
  });

  it("call script: spoken insurer names, no pending applications, a how-soon line, family line for her niche, possessives", () => {
    expect(spokenPayer("BCBSIL")).toBe("Blue Cross Blue Shield of Illinois");
    expect(spokenPayer("Blue Cross and Blue Shield of Illinois (BCBSIL)")).toBe("Blue Cross Blue Shield of Illinois");
    expect(spokenPayer("Aetna")).toBe("Aetna");
    expect(possessive("Lakeshore Associates")).toBe("Lakeshore Associates'");
    expect(possessive("Dr. Tellez")).toBe("Dr. Tellez's");
    const onc = buildCallScript({ ...facts, inNetwork: ["BCBSIL"], appliedPending: ["UHC"], nicheId: "oncology_serious_illness" }, { name: "x", greeting: "Lakeshore Associates" }, "voicemail");
    expect(onc.text).toContain("I'm calling for Lakeshore Associates' office");
    expect(onc.text).not.toMatch(/BCBSIL|UHC|UnitedHealthcare|pending/);
    const front = buildCallScript({ ...facts, inNetwork: ["BCBSIL"], nicheId: "oncology_serious_illness" }, partner, "front_desk");
    expect(front.text).toContain("I'm in network with Blue Cross Blue Shield of Illinois.");
    expect(front.text).toContain("I also see family members and caregivers, including people grieving after a death.");
    expect(front.left_out).toBe(0);
  });
});

describe("sensitive partners", async () => {
  const { blockedReason } = await import("../lib/referrals/outreach");
  it("a DV/SA organization never gets a letter, before any database lookup", async () => {
    expect(await blockedReason({ name: "[Sample] Safe Harbor Shelter", npi: null, stage: "found", sensitive: true })).toMatch(/public line only/);
  });
});
