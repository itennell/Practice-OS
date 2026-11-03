// The Nov 2 Referrals stress test, one test per finding: find any card by name,
// do-not-contact from the chat, ranking that respects who she helps and what she
// asked for, letters from her real facts (revised in place), "Letter ready"
// until she sends it, plain-words area warnings, real dates, and distances that
// stay. No live model, geocoder or NPPES calls: all stand-ins. Fake data only.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { namesExactly, resolveCard, resolveExact, searchCards } from "../lib/aeon/tools-referrals";
import { checkFacts, checkLetter, finishLetter, insurerMatchers, insurersNamed } from "../lib/referrals/outreach";
import { letterWaiting, pickNew, tiersWithLog } from "../lib/referrals/plan";
import { focusRank, tierFor } from "../lib/referrals/tier";
import { outOfStateWarning, splitState, zipState } from "../lib/referrals/states";
import { AreaError, namesPlace, searchArea, type PracticeContext } from "../lib/referrals/area";
import { clearGeocodeCache, geocodePlace } from "../lib/referrals/geocode";
import { isDay } from "../lib/referrals/contacts";
import type { ReferralSource } from "../lib/referrals/store";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine",
  npi_type: "individual", credential: "MD", address: null, city: "Chicago", state: "IL", zip: "60614", phone: null, email: null,
  stage: "found", distance_miles: 0.5, fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null,
  notes: null, is_sample: true, ...over,
});

// ---- 1. find a card by name on a big board -------------------------------------------------
describe("finding a card anywhere on the board", () => {
  const board = Array.from({ length: 162 }, (_, i) =>
    card({ id: `id-${i}`, name: `[Sample] Person${i} Example${i}, MD`, fit_score: 99 - (i % 50), zip: i % 2 ? "60614" : "60657" }),
  );
  board.push(card({ id: "gordon", name: "Carin Gordon, MD", taxonomy: "207V00000X", specialty: "OB/GYN", fit_score: 1, zip: "60610" }));

  it("finds Dr. Gordon though she is card 163, far below the top 50", () => {
    expect(searchCards("Dr Gordon", board).map((c) => c.id)).toEqual(["gordon"]);
    expect(searchCards("Carin Gordon", board)[0].id).toBe("gordon");
    expect(resolveCard("Dr. Gordon", board)).toEqual({ card: board.at(-1) });
  });
  it("finds by kind of provider and by ZIP", () => {
    expect(searchCards("OB-GYN", board).map((c) => c.id)).toEqual(["gordon"]);
    expect(searchCards("60610", board).map((c) => c.id)).toEqual(["gordon"]);
    expect(searchCards("Nobody Here", board)).toEqual([]);
  });
  it("asks which when more than one card fits", () => {
    const two = [...board, card({ id: "g2", name: "Ann Gordon, NP", taxonomy: "363LX0001X" })];
    expect("ask_which" in resolveCard("Gordon", two)).toBe(true);
  });
  it("do-not-contact acts only on an exact name: 'Dr. Chen' never means Cheng", () => {
    const cheng = card({ id: "cheng", name: "[Sample] Wei Cheng, MD" });
    expect(namesExactly("Dr. Chen", cheng)).toBe(false);
    expect(resolveExact("Dr. Chen", [cheng])).toMatchObject({ ask_which: [cheng] });
    const chen = card({ id: "chen", name: "[Sample] Lin Chen, MD" });
    expect(resolveExact("Dr. Chen", [chen, cheng])).toMatchObject({ ask_which: expect.arrayContaining([chen]) });
    expect(resolveExact("Dr. Lin Chen", [chen])).toEqual({ card: chen });
    expect(resolveExact("chen", [chen])).toEqual({ card: chen });
    expect(resolveExact("Lakeview Pediatrics", [card({ id: "o", name: "Lakeview Pediatrics LLC", npi_type: "organization", organization: "Lakeview Pediatrics LLC" })])).toMatchObject({ card: { id: "o" } });
  });
});

// ---- 3. ranking respects who she helps and what she asked for ------------------------------
describe("who to reach out to first, for anxious new moms", () => {
  const ctx = { focus: ["perinatal" as const], clinicianState: "IL" };
  const fam = card({ id: "fam", taxonomy: "207Q00000X", distance_miles: 0.1 });
  const ped = card({ id: "ped", name: "[Sample] Lee Park, MD", taxonomy: "208000000X", specialty: "Pediatrics", distance_miles: 0.8 });
  const ob = card({ id: "ob", name: "[Sample] Kim Ortiz, MD", taxonomy: "207V00000X", specialty: "OB/GYN", distance_miles: 1.5 });
  const mfm = card({ id: "mfm", name: "[Sample] Ana Cruz, MD", taxonomy: "207VM0101X", specialty: "OB/GYN", distance_miles: 0.2 });
  const uro = card({ id: "uro", name: "[Sample] Rae Fox, MD", taxonomy: "207VF0040X", specialty: "OB/GYN", distance_miles: 0.1 });

  it("a pediatrician matches a perinatal practice (new mothers come to every newborn visit)", () => {
    const r = tierFor({ taxonomy: "208000000X", npiType: "individual" }, { miles: 1, focus: ["perinatal"] });
    expect(r.reasons).toContain("matches your new and expecting parents focus");
    expect(r.tier).not.toBe("later");
  });
  it("a urogynecologist doesn't see new or expecting parents; a general OB/GYN ranks before a subspecialist", () => {
    const tiers = tiersWithLog([fam, ped, ob, mfm, uro], {}, ctx);
    expect(tiers.uro.tier).toBe("later");
    expect(focusRank(tiers.ob)).toBe(0);
    expect(focusRank(tiers.mfm)).toBe(1);
    expect(focusRank(tiers.fam)).toBe(2);
  });
  it("after a pediatricians + OB-GYN search: no family medicine, general OB/GYN first", () => {
    const cards = [fam, ped, ob, mfm, uro];
    const tiers = tiersWithLog(cards, {}, ctx);
    const fresh = cards.filter((c) => tiers[c.id].tier !== "later");
    const { picked, kinds } = pickNew(fresh, tiers, ["pediatrics", "ob_gyn"], 3);
    expect(picked.map((c) => c.id)[0]).toBe("ob");
    expect(picked.map((c) => c.id)).not.toContain("fam");
    expect(picked.map((c) => c.id)).not.toContain("uro");
    expect(kinds).toEqual(["Pediatrics", "OB/GYN"]);
  });
  it("without a request, someone who sees her people comes before someone who sees everyone", () => {
    const cards = [fam, ped];
    const tiers = tiersWithLog(cards, {}, ctx);
    expect(pickNew(cards, tiers, [], 3).picked.map((c) => c.id)).toEqual(["ped", "fam"]);
  });
  it("says so when none of the kinds she asked for is ready", () => {
    const tiers = tiersWithLog([fam], {}, ctx);
    expect(pickNew([fam], tiers, ["oncology"], 3)).toMatchObject({ kinds: null, missing: ["Oncology"] });
  });
});

// ---- 4. letters from her real facts --------------------------------------------------------
describe("letters", () => {
  const base =
    "Dear Kathleen Sheehan, NP,\n\nI'm Dana Reyes, a counselor in Lincoln Park who works with new and expecting parents. " +
    "Would you be open to a 15-minute call to introduce ourselves?\n\nWarmly,\nDana Reyes, LCPC";
  it("may name the plans she takes and that she sees private-pay clients; still never money for referrals", () => {
    expect(checkLetter(`${base} I'm in network with Blue Cross Blue Shield and also see clients who pay privately (private pay).`)).toEqual({ ok: true });
    expect(checkLetter(`${base} I'd be glad to pay you for each one.`).ok).toBe(false);
    expect(checkLetter(`${base} Happy to pay you a referral fee.`).ok).toBe(false);
  });
  it("lets her own fee and superbills through; refuses getting paid for referrals in any wording", () => {
    for (const ok of ["My fee is $175 for a 53-minute session.", "Superbills on request for out-of-network benefits.", "We can talk about my fees."]) {
      expect(checkLetter(`${base} ${ok}`)).toEqual({ ok: true });
    }
    for (const bad of [
      "You could get paid for referrals.",
      "Providers get paid when they send clients.",
      "We are paid for referrals.",
      "I offer an honorarium.",
      "A small gratuity for your staff.",
      "A stipend for your time.",
      "Remuneration for each one.",
      "No kickback, of course.",
      "A commission on each client.",
      "$50 for every new client.",
    ]) {
      expect(checkLetter(`${base} ${bad}`).ok, bad).toBe(false);
    }
  });
  it("knows insurers from the payer catalog with their aliases, not everyday words", () => {
    const m = insurerMatchers();
    expect(insurersNamed("I take BCBS and Aetna.", m).map((x) => x.name)).toEqual(expect.arrayContaining(["Aetna (commercial, behavioral health)", "Blue Cross and Blue Shield of Illinois (BCBSIL)"]));
    expect(insurersNamed("I'm in network with UHC.", m).map((x) => x.name)).toContain("UnitedHealthcare / Optum Behavioral Health");
    expect(insurersNamed("Let's grow together; we're united in this.", m)).toEqual([]);
    expect(checkFacts(`${base} I'm in network with Molina.`, { years_in_practice: null, in_network: ["Aetna"] })).toMatchObject({ ok: false });
    expect(checkFacts(`${base} I'm in network with Blue Cross.`, { years_in_practice: null, in_network: ["BCBSIL PPO"] })).toEqual({ ok: true });
  });
  it("never Mr./Ms., never years she didn't give, never an insurer she isn't in network with", () => {
    const facts = { years_in_practice: null, in_network: ["Aetna"] };
    expect(checkFacts(base.replace("Kathleen Sheehan, NP", "Ms. Sheehan"), facts)).toMatchObject({ ok: false });
    expect(checkFacts(`${base} I've been practicing for six years.`, facts)).toMatchObject({ ok: false });
    expect(checkFacts(`${base} I've been practicing for 6 years.`, { ...facts, years_in_practice: 6 })).toEqual({ ok: true });
    expect(checkFacts(`${base} I take BCBS.`, facts)).toMatchObject({ ok: false });
    expect(checkFacts(`${base} I'm in network with Aetna.`, facts)).toEqual({ ok: true });
  });
  it("fixes a gendered salutation and signs with her phone and email", () => {
    const out = finishLetter(base.replace("Kathleen Sheehan, NP", "Ms. Sheehan"), { name: "Kathleen Sheehan, NP", npi_type: "individual" }, {
      phone: "312-555-0142",
      email: "dana@example.com",
    });
    expect(out.startsWith("Dear Kathleen Sheehan, NP,")).toBe(true);
    expect(out).toContain("312-555-0142");
    expect(out.endsWith("dana@example.com")).toBe(true);
    // Already there: not added twice.
    expect(finishLetter(`${base}\n(312) 555-0142`, { name: "x", npi_type: "individual" }, { phone: "312-555-0142", email: null }).match(/555/g)).toHaveLength(1);
  });
});

// ---- 6. area search warnings -----------------------------------------------------------------
describe("area search says where it searched", () => {
  const centers = { "60614": [41.922, -87.652], "60610": [41.903, -87.633], "46320": [41.61, -87.5], "62234": [38.71, -89.97] } as Record<string, [number, number]>;
  const ctx: PracticeContext = { office: null, officeZip: "60614", state: "IL", focus: [] };
  const deps = { centers, search: async () => ({ providers: [], requests: 0 }), geocode: async () => new Map(), check: async () => true } as never;

  it("knows a ZIP's state and splits a typed state off a place", () => {
    expect(zipState("46320")).toBe("IN");
    expect(zipState("60614")).toBe("IL");
    expect(splitState("Naperville IL")).toEqual({ place: "Naperville", state: "IL" });
    expect(splitState("Naperville, Illinois")).toEqual({ place: "Naperville", state: "IL" });
    expect(splitState("Lincoln Park")).toEqual({ place: "Lincoln Park", state: null });
    expect(splitState("Oak Park IL")).toEqual({ place: "Oak Park", state: "IL" });
    expect(outOfStateWarning(["60614"], "IL")).toBeNull();
    expect(splitState("Port Washington")).toEqual({ place: "Port Washington", state: null });
    expect(splitState("Port Washington WI")).toEqual({ place: "Port Washington", state: "WI" });
    expect(splitState("Kansas City")).toEqual({ place: "Kansas City", state: null });
    expect(splitState("Wicker Park in")).toEqual({ place: "Wicker Park in", state: null });
    expect(splitState("Evanston, il")).toEqual({ place: "Evanston", state: "IL" });
    expect(splitState("Springfield, Illinois", (t) => t === "Springfield, Illinois")).toEqual({ place: "Springfield, Illinois", state: null });
  });
  it("counts her naming the place only as whole words", () => {
    expect(namesPlace("Collinsville IL", "Collinsville, Madison County")).toBe(true);
    expect(namesPlace("lin", "Lincoln, Logan County")).toBe(false);
    expect(namesPlace("Park", "Park Ridge, Cook County")).toBe(false);
    expect(namesPlace("near Park Ridge", "Park Ridge, Cook County")).toBe(true);
  });
  it("warns that 46320 is in Indiana", async () => {
    const r = await searchArea({ area: { kind: "zips", zips: ["46320"] }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx, deps);
    expect(r.notes.join(" ")).toMatch(/46320 is in Indiana, outside Illinois where you practice/);
  });
  it("refuses 'abc' matching a town 256 miles away, in plain words", async () => {
    const far = { ...(deps as object), place: async () => ({ point: [38.71, -89.97], label: "Collinsville, Madison County", state: "IL" }) } as never;
    await expect(searchArea({ area: { kind: "place", place: "abc" }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx, far)).rejects.toThrow(
      /"abc" matched Collinsville, Madison County, about \d+ miles from your office/,
    );
    await expect(searchArea({ area: { kind: "place", place: "abc" }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx, far)).rejects.toBeInstanceOf(AreaError);
    // Named on purpose: searched, and the distance said.
    const r = await searchArea({ area: { kind: "place", place: "Collinsville" }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx, far);
    expect(r.notes.join(" ")).toMatch(/Collinsville, Madison County is about \d+ miles from your office/);
  });
  it("says which ZIP an empty box searched", async () => {
    const r = await searchArea({ area: { kind: "empty" }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx, deps);
    expect(r.notes[0]).toBe("You didn't type an area, so I searched around your ZIP code, 60614.");
  });
  it("asks OpenStreetMap for the city, not a road named after the state", async () => {
    clearGeocodeCache();
    const urls: string[] = [];
    const hit = await geocodePlace("Naperville IL", "IL", async (url) => {
      urls.push(url);
      return [
        { lat: "41.7", lon: "-88.2", display_name: "Illinois Route 59, Naperville", category: "highway", type: "primary" },
        { lat: "41.75", lon: "-88.15", display_name: "Naperville, DuPage County, Illinois", category: "boundary", type: "administrative", address: { state: "Illinois" } },
      ];
    });
    expect(new URL(urls[0]).searchParams.get("q")).toBe("Naperville, Illinois");
    expect(hit).toEqual({ point: [41.75, -88.15], label: "Naperville, DuPage County", state: "IL" });
  });
});

describe("a letter waiting counts as in progress", () => {
  it("pending, running, or approved and not sent", () => {
    const l = (status: string, sent?: boolean) => ({ approvalId: "a", status, subject: null, letter: null, sent });
    expect(letterWaiting(l("pending"))).toBe(true);
    expect(letterWaiting(l("done", false))).toBe(true);
    expect(letterWaiting(l("done", true))).toBe(false);
    expect(letterWaiting(l("dismissed"))).toBe(false);
    expect(letterWaiting(undefined)).toBe(false);
  });
});

// ---- 7. dates ----------------------------------------------------------------------------------
describe("follow-up dates", () => {
  it("reads only real days", () => {
    expect(isDay("2026-11-09")).toBe(true);
    expect(isDay("2026-13-01")).toBe(false);
    expect(isDay("2026-02-31")).toBe(false);
    expect(isDay("next Tuesday")).toBe(false);
  });
});

// ---- against the test database -----------------------------------------------------------------
const made: string[] = [];
const approvals: string[] = [];
afterAll(async () => {
  if (!hasDb) return;
  const { db, closeDb } = await import("../lib/db");
  if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
  if (made.length) {
    const npis = (await db()`select npi from practice_os.referral_sources where id in ${db()(made)}`).map((r) => r.npi as string).filter(Boolean);
    if (npis.length) await db()`delete from practice_os.referral_suppressions where npi in ${db()(npis)}`;
    await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
  }
  await closeDb();
});

async function makeCard(name: string, taxonomy = "207V00000X") {
  const { db } = await import("../lib/db");
  const npi = `17${String(Date.now() + made.length * 7).slice(-8)}`;
  const [row] = await db()`
    insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, city, state, zip, distance_miles, fit_score, phone)
    values (${npi}, ${name}, ${taxonomy}, 'OB/GYN', 'individual', 'Chicago', 'IL', '60614', 1.2, 80, '312-555-0199')
    returning id`;
  made.push(row.id);
  return { id: row.id as string, npi };
}

const LETTER =
  "Dear [Sample] Tess Komorowski, MD,\n\nI'm Dana Reyes, a licensed clinical professional counselor in Lincoln Park. I work with new and " +
  "expecting parents. Since your OB/GYN practice is close by, I'd love to introduce myself. Would you be open to a 15-minute call " +
  "in the next few weeks to talk about how we might work together?\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";

function fakeChat(letters: string[], seen: unknown[] = []) {
  let i = 0;
  return (async (_feature: string, body: { messages: unknown[] }) => {
    seen.push(body.messages);
    const letter = letters[Math.min(i++, letters.length - 1)];
    return { choices: [{ message: { content: JSON.stringify({ subject: "Introduction from Reyes Counseling", letter }) } }] };
  }) as never;
}

describe.skipIf(!hasDb)("do not contact, from the chat", () => {
  it("moves the card to Not a fit, clears the follow-up and keeps the NPI off every plan", async () => {
    const { REFERRAL_TOOLS } = await import("../lib/aeon/tools-referrals");
    const { db } = await import("../lib/db");
    const { getSource } = await import("../lib/referrals/store");
    const { outreachPlan } = await import("../lib/referrals/plan");
    const { id, npi } = await makeCard("[Sample] Tess Komorowski, MD");
    await db()`update practice_os.referral_sources set next_follow_up_on = current_date + 3 where id = ${id}`;
    const tool = REFERRAL_TOOLS.find((t) => t.name === "set_do_not_contact")!;
    const res = await tool.run({ source: "Komorowski", reason: "not_interested" } as never, { by: "test" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ done: true, do_not_contact: true, column: "Not a fit", never_suggested_again: true });
    const after = (await getSource(id))!;
    expect(after.stage).toBe("not_a_fit");
    expect(after.next_follow_up_on).toBeNull();
    expect((await db()`select reason from practice_os.referral_suppressions where npi = ${npi}`)[0].reason).toBe("not_interested");
    const [audit] = await db()`select actor from practice_os.audit_log where action = 'referral_suppressed' and subject_id = ${id}`;
    expect(audit.actor).toBe("aeon");
    const plan = await outreachPlan(db(), 50);
    expect([...plan.reach_out, ...plan.follow_ups].some((p) => p.id === id)).toBe(false);
  });
  it("names nobody it didn't find", async () => {
    const { REFERRAL_TOOLS } = await import("../lib/aeon/tools-referrals");
    const tool = REFERRAL_TOOLS.find((t) => t.name === "set_do_not_contact")!;
    const res = await tool.run({ source: "Zzyzx Nobody" } as never, { by: "test" });
    expect(JSON.parse(res.content[0].text)).toMatchObject({ done: false });
  });
});

describe.skipIf(!hasDb)("find_referral_cards", () => {
  it("returns the card with its phone, email and the reminder about names", async () => {
    const { REFERRAL_TOOLS } = await import("../lib/aeon/tools-referrals");
    const { setTypedEmail } = await import("../lib/referrals/evidence/store");
    const { id } = await makeCard("[Sample] Carin Gordonia, MD");
    await setTypedEmail(id, "front-desk@example.com");
    const tool = REFERRAL_TOOLS.find((t) => t.name === "find_referral_cards")!;
    const out = JSON.parse((await tool.run({ query: "Dr. Gordonia" } as never, { by: "test" })).content[0].text);
    expect(out.cards[0]).toMatchObject({ id, phone: "312-555-0199", email: "front-desk@example.com", email_from: "she typed it" });
    expect(out.about_names).toMatch(/never guess he or she/);
    expect(out.searched).toMatch(/^all \d+ cards/);
  });
});

describe.skipIf(!hasDb)("letters: her facts, her log, revised in place", () => {
  it("passes her call note and real contact details to Muse, and a second draft rewrites the waiting one", async () => {
    const { draftOutreach } = await import("../lib/referrals/outreach");
    const { logContact } = await import("../lib/referrals/contacts");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Tess Komorowski, MD");
    await logContact(id, { kind: "called", note: "Front desk said send me a flyer", by: "clinician" }, db(), async (t) => ({ ok: true, text: t }));
    const seen: unknown[] = [];
    const first = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER], seen) });
    approvals.push(first.approvalId);
    expect(JSON.stringify(seen[0])).toContain("Front desk said send me a flyer");
    const second = await draftOutreach(id, { by: "test", note: "shorter", chat: fakeChat([`${LETTER}\nP.S. Happy to drop off flyers.`]) });
    expect(second.approvalId).toBe(first.approvalId);
    expect(second.revised).toBe(true);
    const rows = await db()`select id, payload from practice_os.approvals where kind = 'referral_letter' and payload ->> 'referral_source_id' = ${id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.letter).toContain("drop off flyers");
  });

  it("revise_referral_letter changes the pending letter in place; an approved one is left alone", async () => {
    const { REFERRAL_TOOLS } = await import("../lib/aeon/tools-referrals");
    const { draftOutreach } = await import("../lib/referrals/outreach");
    const { approve } = await import("../lib/approvals");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Tess Komorowski, MD");
    const { approvalId } = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) });
    approvals.push(approvalId);
    const tool = REFERRAL_TOOLS.find((t) => t.name === "revise_referral_letter")!;
    const shorter = LETTER.replace(" in the next few weeks", "");
    const res = await tool.run({ approval_id: approvalId, change: "make it shorter" } as never, { by: "test", chat: fakeChat([shorter]) as never });
    expect(JSON.parse(res.content[1].text)).toMatchObject({ revised: true, approval_id: approvalId });
    const [row] = await db()`select status, payload, preview from practice_os.approvals where id = ${approvalId}`;
    expect(row.status).toBe("pending");
    expect(row.payload.letter.startsWith(shorter)).toBe(true);
    expect(row.preview.body).toBe(row.payload.letter);
    // Her own words that offer something of value are refused.
    const bad = await tool.run({ approval_id: approvalId, letter: `${LETTER}\n\nA $25 gift card for each referral!` } as never, { by: "test" });
    expect(JSON.parse(bad.content[0].text)).toMatchObject({ revised: false });
    process.env.DRY_RUN = "true";
    await approve(approvalId, { by: "test" });
    const late = await tool.run({ approval_id: approvalId, change: "shorter" } as never, { by: "test", chat: fakeChat([shorter]) as never });
    expect(JSON.parse(late.content[0].text)).toMatchObject({ revised: false });
    expect(JSON.parse(late.content[0].text).why).toMatch(/isn't waiting anymore/);
  });
});

describe.skipIf(!hasDb)("dates and distances on the board", () => {
  it("a bad follow-up date gets a plain message, not 'Invalid time value'", async () => {
    const { logContact, setFollowUp } = await import("../lib/referrals/contacts");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Date Test, MD");
    const ok = async (t: string) => ({ ok: true as const, text: t });
    await expect(logContact(id, { kind: "called", followUpOn: "2026-13-01", by: "clinician" }, db(), ok)).rejects.toThrow(/isn't a date I can read/);
    await expect(logContact(id, { kind: "called", happenedOn: "2026-02-31", by: "clinician" }, db(), ok)).rejects.toThrow(/isn't a date I can read/);
    await expect(setFollowUp(id, "2026-13-01")).rejects.toThrow(/isn't a date I can read/);
  });
  it("adding a card again without a distance keeps the distance it had", async () => {
    const { addToBoard, getSource } = await import("../lib/referrals/store");
    const { db } = await import("../lib/db");
    const npi = `16${String(Date.now()).slice(-8)}`;
    const p = {
      npi, name: "[Sample] Keep Distance, MD", organization: null, practiceName: null, npiType: "individual" as const, credential: "MD",
      taxonomy: "207Q00000X", taxonomyLabel: "Family Medicine", specialty: "family_medicine" as const, specialtyLabel: "Family medicine",
      address: "100 W Example St", city: "Chicago", state: "IL", zip: "60614", phone: null, homeAddress: false, fax: null, official: null, lastUpdated: null,
    };
    const first = await addToBoard([{ npi, distanceMiles: 2.4 }], db(), async () => p);
    made.push(first.added[0].id!);
    await addToBoard([{ npi, distanceMiles: null }], db(), async () => p);
    expect((await getSource(first.added[0].id!))!.distance_miles).toBe(2.4);
  });
});

describe.skipIf(!hasDb)("review fixes against the database", () => {
  const tools = async () => (await import("../lib/aeon/tools-referrals")).REFERRAL_TOOLS;
  const run = async (name: string, input: unknown) => JSON.parse((await (await tools()).find((t) => t.name === name)!.run(input as never, { by: "test" })).content[0].text);

  it("a card with no NPI is listed by its name and place (migration 045), and undo takes it off", async () => {
    const { db } = await import("../lib/db");
    const [row] = await db()`
      insert into practice_os.referral_sources (npi, name, city, state, zip) values (null, '[Sample] Noel Npiless, LCSW', 'Chicago', 'IL', '60614') returning id`;
    made.push(row.id);
    const out = await run("set_do_not_contact", { source: row.id });
    expect(out).toMatchObject({ done: true, never_suggested_again: true });
    expect((await db()`select stage from practice_os.referral_sources where id = ${row.id}`)[0].stage).toBe("not_a_fit");
    expect((await db()`select count(*)::int as n from practice_os.referral_suppressions_org where name_key like 'noel npiless%'`)[0].n).toBe(1);
    expect(await run("set_do_not_contact", { source: row.id, undo: true })).toMatchObject({ done: true, do_not_contact: false });
    expect((await db()`select count(*)::int as n from practice_os.referral_suppressions_org where name_key like 'noel npiless%'`)[0].n).toBe(0);
  });

  it("undoing 'asked not to be contacted' needs her confirmation, and the audit names Aeon", async () => {
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Quinn Askednot, MD");
    expect(await run("set_do_not_contact", { source: id, reason: "asked_not_to" })).toMatchObject({ done: true, never_suggested_again: true });
    expect(await run("set_do_not_contact", { source: id, undo: true })).toMatchObject({ done: false, needs_confirmation: expect.any(String) });
    expect(await run("set_do_not_contact", { source: id, undo: true, confirmed: true })).toMatchObject({ done: true, do_not_contact: false });
    const actors = (
      await db()`select actor from practice_os.audit_log where subject_id = ${id} and action in ('referral_suppressed', 'referral_unsuppressed') order by id`
    ).map((r) => r.actor);
    expect(actors).toEqual(["aeon", "aeon"]);
  });

  it("no letter is drafted or approved for someone on the do-not-contact list", async () => {
    const { draftOutreach } = await import("../lib/referrals/outreach");
    const { suppress } = await import("../lib/referrals/contacts");
    const { approve } = await import("../lib/approvals");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Rory Blocked, MD");
    const { approvalId } = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) });
    approvals.push(approvalId);
    // Putting them on the list declines the waiting letter, so it can't be approved at all.
    const { declined } = await suppress(id, "not_interested", db(), "clinician");
    expect(declined).toEqual([approvalId]);
    process.env.DRY_RUN = "true";
    const res = await approve(approvalId, { by: "test" });
    expect(res.ok).toBe(false);
    await expect(draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) })).rejects.toThrow(/do-not-contact list/);
  });

  it("her own letter text gets the fact check too", async () => {
    const { draftOutreach } = await import("../lib/referrals/outreach");
    const { id } = await makeCard("[Sample] Sam Factcheck, MD");
    const { approvalId } = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) });
    approvals.push(approvalId);
    const out = await run("revise_referral_letter", { approval_id: approvalId, letter: `${LETTER}\n\nI have been practicing for 40 years.` });
    expect(out).toMatchObject({ revised: false });
    expect(out.why).toMatch(/years/);
  });

  it("a note that fails the full privacy check never reaches Muse or a tool result", async () => {
    const { draftOutreach } = await import("../lib/referrals/outreach");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Pat Screened, MD");
    // Written straight to the table, as an older row might be: the screening before the model still holds it back.
    await db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by)
               values (${id}, 'called', current_date, 'Her client Maria Lopez was referred by them', 'clinician')`;
    const seen: unknown[] = [];
    const { approvalId } = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER], seen) });
    approvals.push(approvalId);
    expect(JSON.stringify(seen[0])).not.toContain("Maria Lopez");
    const found = await run("find_referral_cards", { query: "Pat Screened" });
    expect(JSON.stringify(found)).not.toContain("Maria Lopez");
    expect(found.cards[0].last_logged).toMatch(/held back/);
  });

  it("an approved letter not yet sent: no second draft, not suggested as new, and in the brief after 2 days", async () => {
    const { draftOutreach, pendingLetter } = await import("../lib/referrals/outreach");
    const { approve } = await import("../lib/approvals");
    const { outreachPlan, lettersReady } = await import("../lib/referrals/plan");
    const { summarize } = await import("../lib/compliance/brief");
    const { db } = await import("../lib/db");
    const { id } = await makeCard("[Sample] Robin Readyletter, MD");
    const { approvalId } = await draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) });
    approvals.push(approvalId);
    process.env.DRY_RUN = "true";
    await approve(approvalId, { by: "test" });
    expect(await pendingLetter(id)).toMatchObject({ id: approvalId, status: "ready" });
    await expect(draftOutreach(id, { by: "test", chat: fakeChat([LETTER]) })).rejects.toThrow(/approved and ready to send/);
    const plan = await outreachPlan(db(), 200);
    expect(plan.reach_out.some((p) => p.id === id)).toBe(false);
    expect(plan.letters_waiting).toBeGreaterThanOrEqual(1);
    expect((await lettersReady()).some((r) => r.id === id)).toBe(false);
    await db()`update practice_os.approvals set decided_at = now() - interval '3 days' where id = ${approvalId}`;
    const ready = await lettersReady();
    expect(ready.find((r) => r.id === id)).toMatchObject({ days: 3 });
    const text = summarize({
      today: "2026-11-02", this_week: [], urgent_soon: [], setup_questions: [], needs_dates: [], payer_dates: [], referral_letters_ready: ready, is_sample: true,
    });
    expect(text).toContain("Referral letters ready, not sent yet");
    expect(text).toContain("[Sample] Robin Readyletter, MD: approved 3 days ago");
  });
});
