// Referral nurture in plain code: the touch cadence by tier (referral-tiers.json,
// judgment), the going-cold flag in the practice's time zone, the weekly plan's
// going-cold nudges (2 at most), the reciprocity line from dates and counts only,
// who is on her "People I refer to" list, and the log_referral_out chat tool.
import { describe, expect, it } from "vitest";
import research from "../docs/research/referral-tiers.json" with { type: "json" };
import { todayIn } from "../lib/compliance/dates";
import type { Contact } from "../lib/referrals/contacts";
import { CONTACT_KINDS, LOGGABLE_KINDS } from "../lib/referrals/contact-kinds";
import {
  CADENCE,
  COLD_NUDGES_PER_WEEK,
  coldAfterDays,
  coldCards,
  coldNudges,
  GRACE_DAYS,
  goingCold,
  lastContactOn,
  NOTE_ACTION,
  ONE_PAGER_ACTION,
  readCadence,
  reciprocity,
  refersTo,
} from "../lib/referrals/nurture";
import { summarizePlan } from "../lib/referrals/plan";
import type { ReferralSource } from "../lib/referrals/store";
import { TIER_LABEL } from "../lib/referrals/tier";
import { REFERRAL_DEMO_TOOLS } from "../lib/features";

const TODAY = "2026-11-02";

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine",
  npi_type: "individual", credential: "MD", address: null, city: "Chicago", state: "IL", zip: "60614", phone: null, email: null,
  stage: "connected", distance_miles: 0.5, fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null,
  notes: null, is_sample: true, ...over,
});
const log = (kind: Contact["kind"], happened_on: string, people_count: number | null = null): Contact => ({
  id: `${kind}-${happened_on}`, source_id: "c1", kind, happened_on, note: null, created_by: "clinician", is_sample: true, people_count,
});
const daysAgo = (n: number, from = TODAY) => {
  const d = new Date(`${from}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("touch cadence by tier", () => {
  it("reads the cadence from referral-tiers.json, labelled judgment", () => {
    expect((research as { touch_cadence: { basis: string } }).touch_cadence.basis).toBe("judgment");
    expect(readCadence(research).byTier).toEqual(CADENCE);
    expect(CADENCE.first).toMatchObject({ minWeeks: 6, maxWeeks: 8 });
    expect(CADENCE.next).toMatchObject({ minWeeks: 12, maxWeeks: 12 });
    expect(CADENCE.later).toMatchObject({ minWeeks: 13, maxWeeks: 13 });
    expect(GRACE_DAYS).toBe(7);
    expect(COLD_NUDGES_PER_WEEK).toBe(2);
  });
  it("throws on a changed shape instead of guessing", () => {
    expect(() => readCadence({})).toThrow(/touch_cadence/);
    expect(() => readCadence({ touch_cadence: { grace_days: 7, nudges_per_week: 2, by_tier: { first: { min_weeks: 9, max_weeks: 8, words: "x" } } } })).toThrow(/first/);
  });
  it("going cold after max weeks plus grace: 63, 91 and 98 days", () => {
    expect(coldAfterDays("first")).toBe(8 * 7 + 7);
    expect(coldAfterDays("next")).toBe(12 * 7 + 7);
    expect(coldAfterDays("later")).toBe(13 * 7 + 7);
  });
});

describe("going cold", () => {
  it("flags a top-tier card one day past cadence plus grace, not on the day", () => {
    expect(goingCold(card({}), [log("met", daysAgo(63))], "first", TODAY)).toBeNull();
    const cold = goingCold(card({}), [log("met", daysAgo(64))], "first", TODAY);
    expect(cold).toMatchObject({ days: 64, weeks: 9, label: "Going cold: last contact 9 weeks ago", cadence: "every 6 to 8 weeks" });
  });
  it("uses the tier's cadence: 70 days is cold for Reach out first, not for Warm up next", () => {
    const c = [log("called", daysAgo(70))];
    expect(goingCold(card({}), c, "first", TODAY)?.label).toBe("Going cold: last contact 10 weeks ago");
    expect(goingCold(card({}), c, "next", TODAY)).toBeNull();
    expect(goingCold(card({}), [log("called", daysAgo(99))], "later", TODAY)).not.toBeNull();
  });
  it("any kind counts as contact, and so does the card's last-contacted date", () => {
    expect(goingCold(card({}), [log("met", daysAgo(120)), log("note", daysAgo(10))], "first", TODAY)).toBeNull();
    expect(goingCold(card({}), [log("met", daysAgo(120)), log("referred_out", daysAgo(5), 1)], "first", TODAY)).toBeNull();
    expect(lastContactOn(card({ last_contacted_at: `${daysAgo(3)}T15:00:00.000Z` }), [log("met", daysAgo(120))])).toBe(daysAgo(3));
  });
  it("never for Not a fit, a card never contacted, or no tier", () => {
    expect(goingCold(card({ stage: "not_a_fit" }), [log("met", daysAgo(200))], "first", TODAY)).toBeNull();
    expect(goingCold(card({ stage: "found" }), [], "first", TODAY)).toBeNull();
    expect(goingCold(card({}), [log("met", daysAgo(200))], undefined, TODAY)).toBeNull();
  });
  it("counts days in the practice's time zone, not UTC", () => {
    // 9pm in Chicago on Nov 2 is already Nov 3 in UTC.
    const evening = new Date("2026-11-03T03:00:00Z");
    expect(todayIn("America/Chicago", evening)).toBe("2026-11-02");
    expect(todayIn("UTC", evening)).toBe("2026-11-03");
    const c = [log("met", "2026-08-31")]; // 63 days before Nov 2
    expect(goingCold(card({}), c, "first", todayIn("America/Chicago", evening))).toBeNull();
    expect(goingCold(card({}), c, "first", todayIn("UTC", evening))).not.toBeNull();
  });
  it("coldCards maps every cold card by id", () => {
    const cards = [card({ id: "a" }), card({ id: "b" }), card({ id: "c", stage: "not_a_fit" })];
    const out = coldCards(cards, { a: [log("met", daysAgo(80))], b: [log("met", daysAgo(10))], c: [log("met", daysAgo(200))] }, { a: { tier: "first" }, b: { tier: "first" }, c: { tier: "first" } }, TODAY);
    expect(Object.keys(out)).toEqual(["a"]);
  });
});

describe("the weekly plan's going-cold nudges", () => {
  const cards = [
    card({ id: "later-old", name: "[Sample] A", email: null }),
    card({ id: "first-70", name: "[Sample] B", email: "b@example.com" }),
    card({ id: "first-90", name: "[Sample] C", email: "c@example.com" }),
    card({ id: "next-100", name: "[Sample] D", email: null }),
    card({ id: "due", name: "[Sample] E" }),
  ];
  const contacts = {
    "later-old": [log("met", daysAgo(300))],
    "first-70": [log("met", daysAgo(70))],
    "first-90": [log("met", daysAgo(90))],
    "next-100": [log("met", daysAgo(100))],
    due: [log("met", daysAgo(200))],
  };
  const tiers = { "later-old": { tier: "later" as const }, "first-70": { tier: "first" as const }, "first-90": { tier: "first" as const }, "next-100": { tier: "next" as const }, due: { tier: "first" as const } };

  it("caps at 2, top tier first then longest without contact, skipping cards already in the plan", () => {
    const n = coldNudges(cards, contacts, tiers, TODAY, { skip: new Set(["due"]), tierLabel: TIER_LABEL });
    expect(n.map((x) => x.id)).toEqual(["first-90", "first-70"]);
    expect(n[0]).toMatchObject({ tier: "Reach out first", weeks: 12, label: "Going cold: last contact 12 weeks ago", action: NOTE_ACTION });
  });
  it("never more than 2, even when asked for more", () => {
    expect(coldNudges(cards, contacts, tiers, TODAY, { max: 10 })).toHaveLength(2);
    expect(coldNudges(cards, contacts, tiers, TODAY, { max: 0 })).toHaveLength(0);
  });
  it("no email means the one-pager, not a note", () => {
    const n = coldNudges([cards[3]], contacts, tiers, TODAY);
    expect(n[0].action).toBe(ONE_PAGER_ACTION);
  });
  it("the summary lists them with the cadence and the action, never anything in return", () => {
    const going_cold = coldNudges(cards, contacts, tiers, TODAY, { tierLabel: TIER_LABEL });
    const s = summarizePlan({ follow_ups: [], reach_out: [], waiting: 0, going_cold });
    expect(s).toContain("Going cold (2):");
    expect(s).toContain("- [Sample] C (Reach out first): last contact 12 weeks ago; aim for every 6 to 8 weeks.");
    expect(s).not.toContain("Nobody new to reach out to");
    expect(s).toContain("Aeon never offers anything in return for a referral.");
    expect(s).not.toMatch(/gift|discount|\$/i);
  });
});

describe("reciprocity and the people she refers to", () => {
  it("counts inbound 'referred' rows and outbound people_count, nothing else", () => {
    const r = reciprocity([log("referred", "2026-10-01"), log("referred", "2026-10-20"), log("referred_out", "2026-10-05", 2), log("referred_out", "2026-10-25", 1), log("met", "2026-09-01")]);
    expect(r).toEqual({ theyReferred: 2, youReferred: 3, line: "They've referred 2 · You've referred 3" });
    expect(reciprocity([]).line).toBe("They've referred 0 · You've referred 0");
    // An older row with no count still counts as one person.
    expect(reciprocity([log("referred_out", "2026-10-05", null)]).youReferred).toBe(1);
  });
  it("is on the list when she referred to them or saved notes about them", () => {
    expect(refersTo([log("referred_out", "2026-10-05", 1)], null)).toBe(true);
    expect(refersTo([log("referred", "2026-10-05")], null)).toBe(false);
    expect(refersTo([], { availability: null, fees: "[Sample] $150", insurance: null })).toBe(true);
    expect(refersTo([], { availability: null, fees: null, insurance: null })).toBe(false);
  });
});

describe("referred_out kind and the log_referral_out tool", () => {
  it("referred_out is a contact kind, but not one the general log form or tool offers", () => {
    expect(CONTACT_KINDS).toContain("referred_out");
    expect(LOGGABLE_KINDS).not.toContain("referred_out");
  });
  it("is registered, changes data, queues over MCP and is allow-listed for the demo", async () => {
    const { TOOLS_BY_NAME } = await import("../lib/aeon/tools");
    const t = TOOLS_BY_NAME.get("log_referral_out");
    expect(t).toBeDefined();
    expect(t!.changesData).toBe(true);
    expect(t!.queuesOverMcp).toBe(true);
    expect(REFERRAL_DEMO_TOOLS).toContain("log_referral_out");
    // Dates and counts only: no field for a note, a name or anything about who was referred.
    expect(Object.keys(t!.input).sort()).toEqual(["count", "date_confirmed", "date_words", "happened_on", "source"]);
    // The general log tool can't log a referral out without a count.
    const general = TOOLS_BY_NAME.get("log_referral_contact")!;
    expect((general.input.kind as unknown as { options: string[] }).options).not.toContain("referred_out");
  });
});
