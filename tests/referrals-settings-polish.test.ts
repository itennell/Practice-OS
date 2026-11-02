// The Nov 2 re-test on merged main, one test per finding: Referrals (names that fit
// several cards, letters that keep what she asked for, "top 3" from the plan, who
// she helps, do-not-contact declining letters, fuzzy dates, they/name) and Settings
// (session length decided by plain code, one approval per change, business days,
// client-form blanks asked for in the chat). Built-in database, stand-in model,
// fake data only. The privacy guard is a pass-through here (its model isn't downloaded).
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));

import { loadEnv } from "../lib/env";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { practiceFacts as formFacts } from "../lib/client-forms/facts";
import { getForm, prepare } from "../lib/client-forms";
import { DEFAULT_POLICIES } from "../lib/client-forms/types";
import { askedFor, checkFacts, focusGroups, type LetterFacts } from "../lib/referrals/outreach";
import { FOCUS_WORDS } from "../lib/referrals/tier";
import { cardNamesIn, familyName, neutralPronouns } from "../lib/referrals/pronouns";
import { choiceOf, resolveExact, whatItSays } from "../lib/aeon/tools-referrals";
import { businessDaysSaid, lengthsNamed, sessionLengthQuestion, toPolicies } from "../lib/aeon/tools-settings";
import type { ReferralSource } from "../lib/referrals/store";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const { blanksToAsk, callKey, fuzzyDateCheck, runTool } = await import("../lib/aeon/tools");
const { suppress } = await import("../lib/referrals/contacts");
const { outreachPlan } = await import("../lib/referrals/plan");
const { writeLetter } = await import("../lib/referrals/outreach");
const forms = await import("../lib/client-forms/store");

const BY = "chat:polish-test";
const body = (r: { content: { text: string }[] }) => JSON.parse(r.content.at(-1)!.text) as Record<string, unknown>;

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine",
  npi_type: "individual", credential: "MD", address: "100 W Main St", city: "Chicago", state: "IL", zip: "60614", phone: null, email: null,
  stage: "found", distance_miles: 0.5, fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null,
  notes: null, is_sample: true, ...over,
});

const FACTS: LetterFacts = {
  clinician: { name: "Dana Reyes", credential: "LCPC", practice: "Reyes Counseling PLLC", neighborhood: "Lincoln Park", city: "Chicago" },
  phone: null,
  email: null,
  in_network: ["Aetna"],
  applied_pending: ["Blue Cross and Blue Shield of Illinois"],
  private_pay: true,
  sliding_scale: true,
  years_in_practice: 6,
  her_log: [],
  who_she_helps: [FOCUS_WORDS.perinatal],
  focus: ["perinatal"],
};

const OLD_LETTER =
  "Dear Dr. Ana Guzman, MD,\n\nI'm Dana Reyes, LCPC, with 6 years in practice in Lincoln Park. I see new and expecting parents. " +
  "I'm in network with Aetna and offer a sliding scale. Would you have 15 minutes for a call?\n\nDana Reyes, LCPC";

// ---- 1. a name that fits several cards asks; no card says so at once ----------------------------
describe("names that fit more than one card, or none", () => {
  const millers = [1, 2, 3, 4].map((i) => card({ id: `m${i}`, name: `[Sample] ${["Ann", "Bo", "Cy", "Di"][i - 1]} Miller, ${i % 2 ? "MD" : "DO"}`, credential: i % 2 ? "MD" : "DO", address: `${i}00 N Clark St` }));
  it("'Dr. Miller' with four Millers asks which, listing name, credential and address", () => {
    const r = resolveExact("Dr. Miller", millers);
    expect("ask_which" in r && r.ask_which).toHaveLength(4);
    const shown = (r as { ask_which: ReferralSource[] }).ask_which.map(choiceOf);
    expect(shown[0]).toMatchObject({ name: "[Sample] Ann Miller, MD", credential: "MD", address: "100 N Clark St, Chicago, IL, 60614" });
  });
});

// ---- 2. a revision keeps what she asked for; years only from her profile ------------------------
describe("what she asked a letter to say (plain code)", () => {
  it("'shorter and mention BCBS' keeps sliding scale and 6 years, and BCBS only as pending", () => {
    const asked = askedFor("make it shorter and mention BCBS", FACTS, OLD_LETTER);
    const what = asked.map((a) => a.what);
    expect(what).toEqual(expect.arrayContaining(["Blue Cross and Blue Shield of Illinois (BCBSIL) (application pending)", "sliding scale", "6 years in practice", "Aetna (commercial, behavioral health)"]));
    expect(asked.every((a) => a.allowed)).toBe(true);
    const bcbs = asked.find((a) => a.what.startsWith("Blue Cross"))!;
    expect(bcbs.hint).toMatch(/in network with Aetna; Blue Cross and Blue Shield of Illinois \(BCBSIL\) application pending/);
    expect(bcbs.says!("In network with Aetna; BCBS application pending.")).toBe(true);
    expect(bcbs.says!("I'm in network with Aetna and BCBS.")).toBe(false);
  });
  it("a plan she never applied to is left out, and says why", () => {
    const asked = askedFor("mention Cigna", FACTS, null);
    expect(asked.find((a) => /Cigna/.test(a.what))).toMatchObject({ allowed: false, why: expect.stringMatching(/isn't in network/) });
  });
  it("'drop the sliding scale' drops it", () => {
    expect(askedFor("drop the sliding scale", FACTS, OLD_LETTER).some((a) => a.what === "sliding scale")).toBe(false);
  });
  it("names a pending plan only as pending; 5 years (or 5-year) never passes for 6", () => {
    expect(checkFacts("I'm in network with Aetna and BCBS.", FACTS)).toMatchObject({ ok: false, reason: expect.stringMatching(/pending/) });
    expect(checkFacts("In network with Aetna; BCBS application pending.", FACTS).ok).toBe(true);
    expect(checkFacts("I have 5 years in practice.", FACTS).ok).toBe(false);
    expect(checkFacts("A 5-year practice.", FACTS).ok).toBe(false);
    expect(checkFacts("I have practiced 6 years.", FACTS).ok).toBe(true);
  });
  it("the honest line lists what it says and what it doesn't", () => {
    const line = whatItSays(["sliding scale"], [{ what: "Cigna", why: "not in network" }]);
    expect(line).toMatch(/It says: sliding scale/);
    expect(line).toMatch(/does NOT say: Cigna \(not in network\)/);
  });
});

// ---- 4. letters name who she helps ---------------------------------------------------------------
describe("who she helps reaches the letter", () => {
  it("'new moms' in the chat becomes the group 'new and expecting parents'", () => {
    expect(focusGroups("find OBs near me for new moms", [])).toEqual(["perinatal"]);
    expect(FOCUS_WORDS.perinatal).toBe("new and expecting parents");
    const asked = askedFor(null, FACTS, null);
    const who = asked.find((a) => a.what.startsWith("who she helps"))!;
    expect(who.says!("I work with new and expecting parents.")).toBe(true);
    expect(who.says!("I work with adults.")).toBe(false);
  });
});

// ---- 6. fuzzy dates ------------------------------------------------------------------------------
describe("fuzzy dates are confirmed, never silent", () => {
  it("'yesterday-ish' comes back with the date it reads as; an exact day or a confirmed one goes on", async () => {
    const r = await fuzzyDateCheck({ happened_on: "2026-11-01", date_words: "yesterday-ish" }, {});
    expect(body(r!)).toMatchObject({ logged: false, needs_confirmation: expect.stringMatching(/Sunday, November 1, 2026 \(2026-11-01\)/) });
    const fromHerWords = await fuzzyDateCheck({ happened_on: "2026-11-01" }, { said: ["I called Dr. Rivera yesterday-ish"] });
    expect(fromHerWords).not.toBeNull();
    expect(await fuzzyDateCheck({ happened_on: "2026-11-01", date_words: "yesterday" }, {})).toBeNull();
    expect(await fuzzyDateCheck({ happened_on: "2026-11-01", date_words: "yesterday-ish", date_confirmed: true }, {})).toBeNull();
  });
});

// ---- 7. they / name ------------------------------------------------------------------------------
describe("providers are 'they' in the reply", () => {
  it("he/his/him and she/her after a provider's name become they/their/them", () => {
    const names = cardNamesIn(JSON.stringify({ cards: [{ name: "[Sample] Ann Johnson, MD" }] }));
    expect(familyName(names[0])).toBe("Johnson");
    const out = neutralPronouns(
      "Dr. Johnson is a good fit. He'll see new parents, he sees kids too and his office is close. Call him or email her office.\nYou have 3 follow-ups; she said hi.",
      names,
    );
    expect(out).toBe(
      "Dr. Johnson is a good fit. They'll see new parents, they see kids too and their office is close. Call them or email their office.\nYou have 3 follow-ups; she said hi.",
    );
    expect(neutralPronouns("He is in network.", names)).toBe("He is in network.");
    expect(neutralPronouns("Dr. Johnson? She is in network and he has an opening.", names)).toBe("Dr. Johnson? They are in network and they have an opening.");
  });
});

// ---- 8, 10, 11. settings in plain code -----------------------------------------------------------
const FEES = [
  { code: "90791", label: "First session (intake)", cents: 20000 },
  { code: "90834", label: "Therapy, 38-52 minutes", cents: 15000 },
  { code: "90837", label: "Therapy, 53 minutes or longer", cents: 17500 },
];

describe("a session fee goes to the length her words name, never the model's pick", () => {
  it("'sessions are $130' with two session codes asks which, whatever the model passed", () => {
    for (const change of [{ service: "follow_up" as const, dollars: 130 }, { code: "90834", dollars: 130 }, { service: "follow_up" as const, dollars: 130, all_lengths: true }]) {
      const q = sessionLengthQuestion(FEES, [change], "sessions are $130");
      expect(q, JSON.stringify(change)).toMatchObject({ ask_which: [{ code: "90834" }, { code: "90837" }] });
    }
  });
  it("a named length, a code or 'every length' goes through", () => {
    expect(lengthsNamed("45-minute sessions are $130").codes).toEqual(new Set(["90834"]));
    expect(sessionLengthQuestion(FEES, [{ code: "90834", dollars: 130 }], "45-minute sessions are $130")).toBeNull();
    expect(sessionLengthQuestion(FEES, [{ service: "follow_up", dollars: 130 }], "my 60 minute sessions are $130")).toBeNull();
    expect(sessionLengthQuestion(FEES, [{ code: "90837", dollars: 160 }], "90837 is $160")).toBeNull();
    expect(sessionLengthQuestion(FEES, [{ service: "follow_up", dollars: 130, all_lengths: true }], "$130 for every session length")).toBeNull();
    expect(sessionLengthQuestion(FEES, [{ code: "90837", dollars: 160 }], "45-minute sessions are $130")).toMatchObject({ ask_which: expect.any(Array) });
    expect(sessionLengthQuestion(FEES, [{ service: "intake", dollars: 150 }], "intake is $150")).toBeNull();
  });
  it("with one session code saved, 'sessions' means that one", () => {
    expect(sessionLengthQuestion([FEES[0], FEES[2]], [{ service: "follow_up", dollars: 130 }], "sessions are $130")).toBeNull();
  });
});

describe("reply time in business days stays business days", () => {
  it("is stored as she said it, clears hours, and prints as business days", () => {
    expect(businessDaysSaid("I reply within 2 business days")).toBe(2);
    expect(toPolicies({ reply_within_business_days: 2 })).toEqual({ reply_within_business_days: 2, reply_within_hours: null });
    expect(toPolicies({ reply_within_hours: 24 })).toEqual({ reply_within_hours: 24, reply_within_business_days: null });
    const facts = formFacts(
      DANA_PROFILE,
      [{ code: "90837", label: "Therapy", cents: 16000 }],
      { ...DEFAULT_POLICIES, reply_within_business_days: 2, backup_colleague: "Jordan Lee, LCSW [Sample]", accepts_insurance: false, texting_ok: true, npp_effective_on: "2026-11-01" },
      "2026-11-02",
      true,
    );
    for (const id of ["practice_policies", "telehealth_consent", "communication_consent"] as const) {
      const p = prepare(getForm(id)!, facts);
      expect(p.text, id).toMatch(/within 2 business days/);
      expect(p.text, id).not.toMatch(/48 hours/);
      expect(p.check.missing, id).toEqual([]);
    }
  });
  it("set_practice_policies refuses hours when her words say business days", async () => {
    const r = await runTool("set_practice_policies", { reply_within_hours: 48 }, { by: BY, said: ["Reply within 2 business days"] });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/reply_within_business_days: 2/);
  });
});

describe("client-form blanks become questions for her", () => {
  it("asks for exactly the blanks the form prints, as set_practice_policies fields", () => {
    const gaps = [
      "[fill in: the date your privacy notice takes effect (Your policies)]",
      "[fill in: whether you bill insurance (Your policies)]",
      "[fill in: the colleague who will contact clients if you can't (Your policies)]",
    ];
    expect(blanksToAsk(gaps, true).map((x) => x.field)).toEqual(["npp_effective_on", "accepts_insurance", "backup_colleague"]);
    expect(blanksToAsk([], false).map((x) => x.field)).toEqual(["cancel_hours"]);
  });
  it("callKey is the same for the same call, keys in any order", () => {
    expect(callKey("set_fees", { a: 1, b: [{ y: 2, x: 1 }] })).toBe(callKey("set_fees", { b: [{ x: 1, y: 2 }], a: 1 }));
    expect(callKey("set_fees", { a: 1 })).not.toBe(callKey("set_fees", { a: 2 }));
  });
});

// ---- Against the built-in database ---------------------------------------------------------------
const sources: string[] = [];
const approvals: string[] = [];
let savedPolicies: { overrides: unknown } | null | undefined;
let savedFees: unknown;

async function makeCard(name: string, over: { credential?: string; address?: string; taxonomy?: string } = {}) {
  const npi = `18${String(Date.now() + sources.length * 7).slice(-8)}`;
  const [row] = await db()`
    insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, credential, address, city, state, zip, distance_miles, fit_score, is_sample)
    values (${npi}, ${name}, ${over.taxonomy ?? "207V00000X"}, 'OB/GYN', 'individual', ${over.credential ?? "MD"}, ${over.address ?? "1 N State St"}, 'Chicago', 'IL', '60614', 0.4, 90, true)
    returning id`;
  sources.push(row.id);
  return row.id as string;
}

const aeonActions = async () => (await db()<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where created_by = ${BY}`)[0].n;

afterAll(async () => {
  if (!hasDb) return;
  const sql = db();
  if (savedPolicies !== undefined) {
    if (savedPolicies) await sql`update practice_os.client_form_templates set overrides = ${sql.json(savedPolicies.overrides as never)} where form_type = '_practice'`;
    else await sql`delete from practice_os.client_form_templates where form_type = '_practice'`;
  }
  if (savedFees !== undefined) await sql`update practice_os.clinician_profile set fee_schedule = ${sql.json(savedFees as never)}`;
  await sql`delete from practice_os.approvals where created_by = ${BY} or id in ${sql(approvals.length ? approvals : ["00000000-0000-0000-0000-000000000000"])}`;
  if (sources.length) await sql`delete from practice_os.referral_sources where id in ${sql(sources)}`;
  await closeDb();
});

describe.skipIf(!hasDb)("referrals against the database", () => {
  it("'Dr. Quillfeather' with four cards asks which before anything is queued (Manual)", async () => {
    for (const [i, cred] of ["MD", "DO", "MD", "CNM"].entries()) await makeCard(`[Sample] ${["Ann", "Bo", "Cy", "Di"][i]} Quillfeather, ${cred}`, { credential: cred, address: `${i + 1}00 N Clark St` });
    const before = await aeonActions();
    const r = await runTool("set_do_not_contact", { source: "Dr. Quillfeather" }, { by: BY, mode: "manual" });
    const out = body(r);
    expect(out.done).toBe(false);
    expect(out.ask_which).toHaveLength(4);
    expect((out.ask_which as Record<string, unknown>[])[0]).toMatchObject({ credential: expect.any(String), address: expect.stringMatching(/N Clark St/) });
    expect(await aeonActions()).toBe(before);
  });

  it("'Dr. Kimwhistle' with no card says so at once and queues nothing", async () => {
    const before = await aeonActions();
    const r = await runTool("set_do_not_contact", { source: "Dr. Kimwhistle" }, { by: BY, mode: "manual" });
    expect(body(r).why).toMatch(/No card on her Referrals board is named "Dr\. Kimwhistle"/);
    expect(await aeonActions()).toBe(before);
    const log = await runTool("log_referral_contact", { source: "Dr. Kimwhistle", kind: "called" }, { by: BY, mode: "manual" });
    expect(body(log).logged).toBe(false);
    expect(await aeonActions()).toBe(before);
  });

  it("a fuzzy date asks before anything is queued", async () => {
    const id = await makeCard("[Sample] Pia Fernwhistle, MD");
    const before = await aeonActions();
    const r = await runTool("log_referral_contact", { source: id, kind: "called", happened_on: "2026-11-01", date_words: "yesterday-ish" }, { by: BY, mode: "manual", said: ["called her yesterday-ish"] });
    expect(body(r)).toMatchObject({ logged: false, needs_confirmation: expect.stringMatching(/2026-11-01/) });
    expect(await aeonActions()).toBe(before);
  });

  it("do-not-contact declines the letter waiting in Approvals, audited", async () => {
    const id = await makeCard("[Sample] Lou Brackenridge, MD");
    const [a] = await db()<{ id: string }[]>`
      insert into practice_os.approvals (kind, title, preview, payload, status, created_by)
      values ('referral_letter', '[Sample] Intro letter', '{}'::jsonb, ${db().json({ referral_source_id: id, subject: "Hi", letter: "x" } as never)}, 'pending', ${BY})
      returning id`;
    approvals.push(a.id);
    const r = await suppress(id, "asked_not_to", undefined, "aeon");
    expect(r.declined).toEqual([a.id]);
    const [row] = await db()<{ status: string }[]>`select status from practice_os.approvals where id = ${a.id}`;
    expect(row.status).toBe("rejected");
    const [audit] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.audit_log where action = 'approval_declined' and approval_id = ${a.id}`;
    expect(audit.n).toBe(1);
    await db()`delete from practice_os.referral_suppressions where npi = (select npi from practice_os.referral_sources where id = ${id})`;
  });

  it("a revision keeps BCBS (as pending), sliding scale and 6 years; plain code checks, retrying until it does", async () => {
    const id = await makeCard("[Sample] Ana Guzman, MD");
    const source = (await (await import("../lib/referrals/store")).getSource(id))!;
    const drafts = [
      // Drops BCBS and changes the years: refused by the fact check.
      "Dear Ana Guzman, MD,\n\nI'm Dana Reyes, LCPC, with 5 years in practice. I see new and expecting parents and am in network with Aetna. I offer a sliding scale. Would a 15-minute call work?\n\nDana Reyes, LCPC",
      // Right years, still no BCBS: plain code asks again.
      "Dear Ana Guzman, MD,\n\nI'm Dana Reyes, LCPC, with 6 years in practice. I see new and expecting parents and am in network with Aetna. I offer a sliding scale. Would a 15-minute call work?\n\nDana Reyes, LCPC",
      "Dear Ana Guzman, MD,\n\nI'm Dana Reyes, LCPC, with 6 years in practice. I see new and expecting parents. In network with Aetna; BCBS application pending. I offer a sliding scale. Would a 15-minute call work?\n\nDana Reyes, LCPC",
    ];
    let calls = 0;
    const chat = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: drafts[calls++] }) } }] })) as never;
    const r = await writeLetter(source, { chat, note: "make it shorter and mention BCBS", previous: { subject: "Hi", letter: OLD_LETTER }, facts: FACTS });
    expect(calls).toBe(3);
    expect(r.letter).toMatch(/BCBS application pending/);
    expect(r.included).toEqual(expect.arrayContaining(["sliding scale", "6 years in practice", "Blue Cross and Blue Shield of Illinois (BCBSIL) (application pending)"]));
    expect(r.left_out).toEqual([]);

    // A model that never says BCBS: the result says so honestly instead of claiming it.
    const stubborn = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: drafts[1] }) } }] })) as never;
    const honest = await writeLetter(source, { chat: stubborn, note: "mention BCBS", previous: { subject: "Hi", letter: OLD_LETTER }, facts: FACTS });
    expect(honest.left_out.map((x) => x.what)).toContain("Blue Cross and Blue Shield of Illinois (BCBSIL) (application pending)");
    expect(honest.included).not.toContain("Blue Cross and Blue Shield of Illinois (BCBSIL) (application pending)");
  });

  it("'letters for my top 3' drafts for the plan's first three, in its order", async () => {
    for (const n of ["Ivy Thornquist", "Jo Thornquist-Bell", "Kai Thornwhistle"]) await makeCard(`[Sample] ${n}, MD`);
    const plan = await outreachPlan(undefined, 3);
    const expected = plan.reach_out.slice(0, 3).map((x) => x.name);
    const letter = "Dear Doctor,\n\nI'm Dana Reyes, LCPC, in Lincoln Park. I see new and expecting parents and adults. Would you be open to a 15-minute call to talk about how we might work together?\n\nDana Reyes, LCPC";
    const chat = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter }) } }] })) as never;
    const r = await runTool("draft_outreach", { top: 3 }, { by: BY, chat });
    const out = body(r) as { from: string; letters: { to: string; approval_id?: string }[] };
    approvals.push(...out.letters.flatMap((l) => (l.approval_id ? [l.approval_id] : [])));
    expect(out.from).toBe("referral_outreach_plan");
    expect(out.letters.map((l) => l.to)).toEqual(expected);
  });
});

describe.skipIf(!hasDb)("settings against the database", () => {
  it("'sessions are $130' with two session codes asks which and queues nothing (Manual)", async () => {
    const [p] = await db()<{ fee_schedule: unknown }[]>`select fee_schedule from practice_os.clinician_profile limit 1`;
    savedFees = p.fee_schedule;
    await db()`update practice_os.clinician_profile set fee_schedule = ${db().json(FEES as never)}`;
    const before = await aeonActions();
    for (const args of [{ changes: [{ service: "follow_up", dollars: 130 }] }, { changes: [{ code: "90834", dollars: 130 }] }]) {
      const r = await runTool("set_fees", args, { by: BY, mode: "manual", said: ["sessions are $130"] });
      expect(r.isError).toBe(true);
      expect(JSON.parse(r.content[0].text)).toMatchObject({ saved: false, ask_which: [{ code: "90834" }, { code: "90837" }] });
    }
    expect(await aeonActions()).toBe(before);
  });

  it("one fee message asked twice is one 'Change her fees' approval", async () => {
    const args = { changes: [{ code: "90834", dollars: 130 }] };
    const ctx = { by: BY, mode: "manual" as const, said: ["45-minute sessions are $130"] };
    const a = body(await runTool("set_fees", args, ctx));
    const b = body(await runTool("set_fees", { changes: [{ dollars: 130, code: "90834" }] }, ctx));
    expect(a.waiting_for_her).toBe(true);
    expect(b.approval_id).toBe(a.approval_id);
    expect(b.already_waiting).toBe(true);
    const [n] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where created_by = ${BY} and kind = 'aeon_action' and status = 'pending' and payload ->> 'tool' = 'set_fees'`;
    expect(n.n).toBe(1);
  });

  it("a privacy notice without its date asks for that date in the chat, saves it, then the blank is gone", async () => {
    const [row] = await db()<{ overrides: unknown }[]>`select overrides from practice_os.client_form_templates where form_type = '_practice'`;
    savedPolicies = row ?? null;
    await forms.savePolicies({ cancel_hours: 24, npp_effective_on: null, accepts_insurance: null, backup_colleague: "" }, db(), BY);
    const first = body(await runTool("create_document", { kind: "client_form", client_form: { form: "npp" } }, { by: BY }));
    expect(first.downloadable).toBe(false);
    expect((first.ask_her_for as { field: string }[]).map((x) => x.field)).toContain("npp_effective_on");
    const saved = await runTool("set_practice_policies", { npp_effective_on: "2026-11-01" }, { by: BY });
    expect(body(saved).saved).toBe(true);
    const again = body(await runTool("create_document", { kind: "client_form", client_form: { form: "npp" } }, { by: BY }));
    expect(((again.ask_her_for as { field: string }[] | undefined) ?? []).map((x) => x.field)).not.toContain("npp_effective_on");
  });
});
