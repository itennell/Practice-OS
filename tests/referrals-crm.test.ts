// Referrals v2 CRM: the contact log, follow-ups in the morning brief, tier
// points from the log (referral-tiers.json), do-not-contact, and the chat's
// "who should I reach out to" and "log that I called Dr. X".
import { afterAll, describe, expect, it } from "vitest";
import research from "../docs/research/referral-tiers.json" with { type: "json" };
import { loadEnv } from "../lib/env";
import { followUpsFrom, summarizePlan, cardsNamed } from "../lib/referrals/plan";
import { relationshipFrom } from "../lib/referrals/contacts";
import { MODIFIERS, readModifiers, tierFor, withRelationship } from "../lib/referrals/tier";
import type { ReferralSource } from "../lib/referrals/store";
import { summarize } from "../lib/compliance/brief";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);
const okGuard = async (t: string) => ({ ok: true as const, text: t });

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine", npi_type: "individual",
  credential: "MD", address: null, city: "Chicago", state: "IL", zip: "60614", phone: null, email: null, stage: "found", distance_miles: 0.5,
  fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null, notes: null, is_sample: false, ...over,
});

describe("tier points from the log", () => {
  it("reads the modifiers from referral-tiers.json", () => {
    expect(readModifiers(research)).toEqual(MODIFIERS);
    expect(MODIFIERS.referredBefore.points).toBe(20);
    expect(MODIFIERS.warmIntro.points).toBe(15);
    expect(MODIFIERS.met.points).toBe(10);
    expect(MODIFIERS.replied.points).toBe(8);
  });
  it("a reply and a meeting raise the score and can move the tier, with the reasons shown", () => {
    const base = tierFor({ taxonomy: "207R00000X", npiType: "organization" }, { miles: 3, focus: [] });
    expect(base.tier).toBe("later");
    const r = withRelationship(base, { warmIntro: false, referredBefore: false, met: true, replied: true });
    expect(r.score).toBe(base.score + 18);
    expect(r.tier).not.toBe("later");
    expect(r.reasons[1]).toBe("You have met");
    expect(r.reasons[2]).toBe("They answered your letter");
  });
  it("'not who you help' stays Later unless they already referred to her", () => {
    const kids = tierFor({ taxonomy: "208000000X", npiType: "individual" }, { miles: 0, focus: ["older_adults"] });
    expect(withRelationship(kids, { warmIntro: true, referredBefore: false, met: true, replied: true }).tier).toBe("later");
    expect(withRelationship(kids, { warmIntro: true, referredBefore: true, met: true, replied: true }).tier).toBe("first");
  });
  it("relationship comes from the log and the intro", () => {
    const rel = relationshipFrom([{ kind: "referred", happened_on: "2026-10-01" }, { kind: "called", happened_on: "2026-09-01" }, { kind: "referred", happened_on: "2026-10-20" }], "a colleague");
    expect(rel).toEqual({ warmIntro: true, referredBefore: true, referredCount: 2, met: false, replied: false, lastContactOn: "2026-09-01" });
  });
});

describe("follow-ups and the plan", () => {
  const today = "2026-10-29";
  it("lists follow-ups within a week, overdue first, never Not a fit", () => {
    const f = followUpsFrom(
      [card({ id: "a", next_follow_up_on: "2026-11-02" }), card({ id: "b", next_follow_up_on: "2026-10-25" }), card({ id: "c", next_follow_up_on: "2026-11-20" }), card({ id: "d", stage: "not_a_fit", next_follow_up_on: "2026-10-29" })],
      { a: [{ id: "x", source_id: "a", kind: "called", happened_on: "2026-10-26", note: null, created_by: "clinician", is_sample: false }] },
      today,
    );
    expect(f.map((x) => [x.id, x.days_left])).toEqual([["b", -4], ["a", 4]]);
    expect(f[1].last).toBe("you called on 2026-10-26");
  });
  it("the morning brief adds referral follow-ups as their own block", () => {
    const text = summarize({ today, this_week: [], urgent_soon: [], setup_questions: [], needs_dates: [], payer_dates: [], is_sample: false, referral_follow_ups: [{ id: "b", name: "Maria Rivera, MD", on: "2026-10-25", days_left: -4, stage: "Follow up", last: null }] });
    expect(text).toContain("Referral follow-ups (1):\n- Maria Rivera, MD (4 days overdue");
  });
  it("the plan text never offers anything for a referral", () => {
    expect(summarizePlan({ follow_ups: [], reach_out: [], waiting: 2 })).toMatch(/give them time[\s\S]*never offers anything in return/);
  });
  it("finds cards by how she says the name", () => {
    const cards = [card({ id: "1", name: "Maria Rivera, MD" }), card({ id: "2", name: "Marcus Rivera, DO" }), card({ id: "3", name: "Lakeview Pediatrics", npi_type: "organization", organization: "Lakeview Pediatrics LLC" })];
    expect(cardsNamed("Dr. Rivera", cards).map((c) => c.id)).toEqual(["1", "2"]);
    expect(cardsNamed("Maria Rivera", cards).map((c) => c.id)).toEqual(["1"]);
    expect(cardsNamed("lakeview pediatrics", cards).map((c) => c.id)).toEqual(["3"]);
    expect(cardsNamed("Dr. Okafor", cards)).toEqual([]);
  });
});

describe.skipIf(!hasDb)("the log against the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { logContact, suppress, contactsFor, setIntroducedBy } = await import("../lib/referrals/contacts");
  const { outreachPlan, cardView } = await import("../lib/referrals/plan");
  const { findReferralSources } = await import("../lib/referrals/store");
  const { practiceToday } = await import("../lib/compliance/store");
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db()`delete from practice_os.referral_sources where id in ${db()(ids)}`;
    await db()`delete from practice_os.referral_suppressions where npi like '19000009%'`;
    await closeDb();
  });
  async function make(npi: string, name = "Test Rivera, MD") {
    const [row] = await db()`
      insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, city, state, zip, distance_miles, fit_score, score_version)
      values (${npi}, ${name}, '207Q00000X', 'Family medicine', 'individual', 'Chicago', 'IL', '60614', 0.2, 90, 3) returning id`;
    ids.push(row.id);
    return row.id as string;
  }

  it("a call moves Found to Contacted with a follow-up a week out; a reply moves it to Connected and raises the tier", async () => {
    const id = await make("1900000901");
    const today = await practiceToday();
    const called = await logContact(id, { kind: "called", note: "Left a message with the front desk.", by: "clinician" }, db(), okGuard);
    expect(called.stage).toBe("contacted");
    const week = new Date(`${today}T12:00:00Z`);
    week.setUTCDate(week.getUTCDate() + 7);
    expect(called.nextFollowUpOn).toBe(week.toISOString().slice(0, 10));
    const before = (await cardView(id))!.tier.score;
    const replied = await logContact(id, { kind: "replied", by: "clinician" }, db(), okGuard);
    expect(replied.stage).toBe("connected");
    expect(replied.nextFollowUpOn).toBeNull();
    expect((await cardView(id))!.tier.score).toBe(Math.min(100, before + 8));
  });

  it("'they referred someone' keeps no note, and the database refuses one", async () => {
    const id = await make("1900000902");
    const r = await logContact(id, { kind: "referred", note: "Jane D., 34, anxiety", by: "clinician" }, db(), okGuard);
    expect(r.contact.note).toBeNull();
    await expect(db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by) values (${id}, 'referred', current_date, 'x', 'clinician')`).rejects.toThrow(/referred_has_no_note/);
    expect((await contactsFor([id]))[id]).toHaveLength(1);
  });

  it("a note the privacy guard refuses is not saved", async () => {
    const id = await make("1900000903");
    const refuse = async () => ({ ok: false as const, kind: "client_name" as const });
    await expect(logContact(id, { kind: "note", note: "About my client", by: "clinician" }, db(), refuse)).rejects.toThrow();
    await expect(setIntroducedBy(id, "someone", db(), refuse)).rejects.toThrow();
    expect((await contactsFor([id]))[id]).toBeUndefined();
  });

  it("no future dates", async () => {
    const id = await make("1900000904");
    await expect(logContact(id, { kind: "called", happenedOn: "2999-01-01", by: "clinician" }, db(), okGuard)).rejects.toThrow(/future/);
  });

  it("do-not-contact hides them from the plan and from new searches", async () => {
    const id = await make("1900000905", "Test Okafor, MD");
    await suppress(id, "asked_not_to");
    const plan = await outreachPlan();
    expect(plan.reach_out.map((p) => p.id)).not.toContain(id);
    const fetcher = async () => ({ results: [{ number: "1900000905", enumeration_type: "NPI-1", basic: { first_name: "TEST", last_name: "OKAFOR", credential: "MD" }, taxonomies: [{ code: "207Q00000X", primary: true }], addresses: [{ address_purpose: "LOCATION", address_1: "1 TEST WAY", city: "CHICAGO", state: "IL", postal_code: "60614" }] }] });
    const r = await findReferralSources({ zip: "60614", specialties: ["family_medicine"], radiusMiles: 0, fetcher: fetcher as never });
    expect(r.found.map((f) => f.npi)).not.toContain("1900000905");
  });
});
