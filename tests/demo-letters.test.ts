// Demo scene 3, "Draft a letter to my top 3" (stress test 2026-11-02, wave 4):
// approval cards for every letter, a slim summary the privacy check lets through,
// her niche in every letter, a singular role, "Dear Dr. Tellez,", the demo
// signature, letters drafted side by side, "I sent it" once per letter, and the
// no-fees/gifts rule (wave 4 privacy: a goodie basket per patient got through).
import { existsSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/memory", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/memory")>()), relevantMemories: async () => [] }));

import { loadEnv } from "../lib/env";
import { NER_MODEL, modelCacheDir } from "../lib/aeon/phi-classifier";
import type { LetterFacts } from "../lib/referrals/outreach";
import type { ReferralSource } from "../lib/referrals/store";
import { FOCUS_WORDS } from "../lib/referrals/tier";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);
const nerReady = hasDb && existsSync(path.join(modelCacheDir(), NER_MODEL));

const { approvalIdsOf } = await import("../lib/aeon/agent");
const { letterSummary, mapLimit, LETTERS_AT_ONCE, guardResult } = await import("../lib/aeon/tools");
const { WITHHELD } = await import("../lib/aeon/guard");
const outreach = await import("../lib/referrals/outreach");
const { askedFor, checkLetter, finishLetter, nicheWords, providerRole, salutationFor, signatureLine, valueOffered, writeLetter } = outreach;
const { checkNote, CRISIS_NOTE, logContact } = await import("../lib/referrals/contacts");
const { closeDb, db } = await import("../lib/db");

const ID1 = "11111111-2222-4333-8444-555555555555";
const ID2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";

const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Emilie Quillon, MS, CGC", organization: null, taxonomy: "170300000X", specialty: "Genetic counselors",
  npi_type: "individual", credential: "MS, CGC", address: "100 W Main St", city: "Chicago", state: "IL", zip: "60614", phone: null, email: null,
  stage: "found", distance_miles: 0.5, fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null,
  notes: null, is_sample: true, ...over,
});

const FACTS: LetterFacts = {
  clinician: { name: "Dana Reyes", credential: "LCPC", practice: "Reyes Counseling PLLC", neighborhood: "Lincoln Park", city: "Chicago", is_sample: true },
  phone: "312-555-0142",
  email: "dana@example.com",
  in_network: ["Aetna"],
  applied_pending: [],
  private_pay: true,
  sliding_scale: null,
  years_in_practice: null,
  her_log: [],
  who_she_helps: [FOCUS_WORDS.adults],
  focus: ["adults"],
  niche: nicheWords("oncology_serious_illness"),
};

const CLEAN =
  "Dear Emilie Quillon, MS, CGC,\n\nI'm Dana Reyes, a licensed clinical professional counselor in Lincoln Park. I work with people facing " +
  "cancer, serious illness and the end of life, and with adults. As a genetic counselor, you meet people at hard moments. Would you be open " +
  "to a 15-minute call to talk about how we might work together? I'm in network with Aetna.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";

describe("approval cards for every letter", () => {
  it("reads approval_ids[] as well as approval_id", () => {
    expect(approvalIdsOf({ content: [{ type: "text", text: "3 letters queued" }], structuredContent: { status: "pending", approval_ids: [ID1, ID2] } })).toEqual([ID1, ID2]);
    expect(approvalIdsOf({ content: [{ type: "text", text: "queued" }], structuredContent: { approval_id: ID1 } })).toEqual([ID1]);
    // Not an id: never a card.
    expect(approvalIdsOf({ content: [{ type: "text", text: "" }], structuredContent: { approval_ids: ["nope", 7] } })).toEqual([]);
  });
});

describe("the letters' summary for the chat model", () => {
  it("is who, the approval and phone/email/plans as true or false, never the letter", () => {
    const s = letterSummary(1, { approvalId: ID1, source: { name: "[Sample] Claudia Quillmere, MD", organization: null }, says: { phone: true, email: true, plans: false } });
    expect(s).toEqual({ rank: 1, approval_id: ID1, to: "[Sample] Claudia Quillmere, MD", includes_phone: true, includes_email: true, includes_plans: false });
    expect(JSON.stringify(s)).not.toMatch(/Dear|letter/i);
  });
  it("says plain code what a letter includes", () => {
    expect(outreach.letterIncludes(`${CLEAN}\n312-555-0142\ndana@example.com`, FACTS)).toEqual({ phone: true, email: true, plans: true });
    expect(outreach.letterIncludes("Dear Dr. Q,\nHello.", FACTS)).toEqual({ phone: false, email: false, plans: false });
  });
  it.skipIf(!nerReady)("passes the privacy check (it was WITHHELD before)", async () => {
    const to = ["Claudia Tellez, MD", "Emilie Blair, MS, CGC", "[Sample] Quillmere Oncology Group"];
    const letters = to.map((name, i) =>
      letterSummary(i + 1, { approvalId: ID1, source: { name, organization: i === 2 ? name : null }, says: { phone: true, email: true, plans: true } }),
    );
    const guarded = await guardResult({ content: [{ type: "text", text: JSON.stringify({ from: "referral_outreach_plan", letters }) }] }, "draft_outreach");
    expect(guarded.content[0].text).not.toBe(WITHHELD);
  });
});

describe("letters drafted side by side", () => {
  it("runs at most 3 at once and keeps the plan's order", async () => {
    let running = 0;
    let most = 0;
    const out = await mapLimit([30, 5, 20, 1, 10], LETTERS_AT_ONCE, async (ms, i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, ms));
      running--;
      return i + 1;
    });
    expect(out).toEqual([1, 2, 3, 4, 5]);
    expect(most).toBe(3);
  });
});

describe("salutation, role, niche and signature", () => {
  it("greets doctors as Dr. Lastname and others by name without credentials", () => {
    expect(salutationFor({ name: "Claudia Tellez, MD", npi_type: "individual" })).toBe("Dr. Tellez");
    expect(salutationFor({ name: "[Sample] Ana Guzman, DO", npi_type: "individual" })).toBe("Dr. Guzman");
    expect(salutationFor({ name: "Pat Lee", npi_type: "individual", credential: "Ph.D." })).toBe("Dr. Lee");
    expect(salutationFor({ name: "Sam Ortiz Jr, PsyD", npi_type: "individual" })).toBe("Dr. Ortiz");
    expect(salutationFor({ name: "[Sample] Dr. Alex Example", npi_type: "individual" })).toBe("Dr. Example");
    expect(salutationFor({ name: "Emilie Blair, MS, CGC", npi_type: "individual" })).toBe("Emilie Blair");
    expect(salutationFor({ name: "Kathleen Sheehan, NP", npi_type: "individual" })).toBe("Kathleen Sheehan");
    expect(salutationFor({ name: "[Sample] Quillmere Oncology Group", npi_type: "organization" })).toBe("Quillmere Oncology Group team");
  });
  it("says a singular role, never the board's plural label", () => {
    expect(providerRole(card({}))).toBe("a genetic counselor");
    expect(providerRole(card({ specialty: "Oncology" }))).toBe("an oncologist");
    expect(providerRole(card({ specialty: "Palliative care" }))).toBe("a palliative care specialist");
    expect(providerRole(card({ specialty: "Nurse practitioners and PAs", credential: "PA-C" }))).toBe("a physician assistant");
    expect(providerRole(card({ specialty: "Chiropractic, acupuncture, massage", taxonomy: "Chiropractor" }))).toBe("a chiropractor");
    expect(providerRole(card({ npi_type: "organization", specialty: "Hospice" }))).toBeNull();
  });
  it("signs the demo practice's letters with exactly the demo line", () => {
    expect(signatureLine(FACTS.clinician)).toBe("Dana Reyes, LCPC (fictional demo practice)");
    expect(signatureLine({ ...FACTS.clinician!, is_sample: false })).toBe("Dana Reyes, LCPC");
    const out = finishLetter(CLEAN, card({ name: "Claudia Tellez, MD", credential: "MD", is_sample: false }), FACTS);
    expect(out.startsWith("Dear Dr. Tellez,\n")).toBe(true);
    expect(out).toContain("\nDana Reyes, LCPC (fictional demo practice)\nReyes Counseling PLLC");
    expect(out.match(/Dana Reyes, LCPC \(fictional demo practice\)/g)).toHaveLength(1);
    expect(out.endsWith("312-555-0142\ndana@example.com")).toBe(true);
    // A [Sample] card's letter says so; a letter with no sign-off gets one.
    const bare = finishLetter("Hi there,\n\nA short note to introduce myself and offer a 15-minute call.", card({}), FACTS);
    expect(bare.startsWith("[Sample] Dear Emilie Quillon,")).toBe(true);
    expect(bare).toContain("Dana Reyes, LCPC (fictional demo practice)");
  });
  it("asks every letter to say her niche, checked by plain code", () => {
    const niche = askedFor(null, FACTS).find((a) => a.what.startsWith("her focus"))!;
    expect(niche).toMatchObject({ allowed: true });
    expect(niche.says!("I work with people facing cancer and serious illness.")).toBe(true);
    expect(niche.says!("I work with adults and families.")).toBe(false);
    expect(nicheWords("general_adult")).toBeNull();
  });
  it("gives Muse the role, the salutation, her niche and the signature, and retries 'someone in Genetic counselors'", async () => {
    const seen: string[] = [];
    const drafts = [CLEAN.replace("As a genetic counselor", "As someone in Genetic counselors"), CLEAN];
    let i = 0;
    const chat = (async (_f: string, body: { messages: { content: string }[] }) => {
      seen.push(body.messages.map((m) => m.content).join("\n"));
      return { choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: drafts[Math.min(i++, 1)] }) } }] };
    }) as never;
    const r = await writeLetter(card({}), { chat, facts: FACTS });
    expect(i).toBe(2);
    expect(r.letter).not.toMatch(/someone in [A-Z]/);
    expect(seen[0]).toContain('"role": "a genetic counselor"');
    expect(seen[0]).toContain('"salutation": "Emilie Quillon"');
    expect(seen[0]).toContain('"her_niche": "people facing cancer, serious illness and the end of life"');
    expect(seen[0]).toContain('"signature": "Dana Reyes, LCPC (fictional demo practice)"');
    expect(seen[0]).not.toContain("Genetic counselors");
    expect(r.says).toEqual({ phone: true, email: true, plans: true });
    expect(r.included).toEqual(expect.arrayContaining([expect.stringMatching(/^her focus/)]));
  });
});

describe("no fees or gifts for referrals", () => {
  const base = "Dear Dr. Q,\n\nI'm Dana Reyes, a counselor in Lincoln Park. Would you be open to a 15-minute call to introduce ourselves?";
  const REFUSE = [
    "I will drop off a goodie basket for your team for each new patient you send my way.",
    "Drop off a thank-you basket for the team for every patient they send.",
    "Coffee on me for every referral.",
    "Happy hour is on us next Friday.",
    "I'll send a $25 Starbucks card for every client you refer.",
    "Here's an Amazon card to say thanks.",
    "I'd like to offer your office a gift card.",
    "I'll bring treats for your staff.",
    "Some swag for your front desk.",
    "Lunch is on me.",
    "As a thank you, I'll cover your team's coffee.",
    "A small token of my appreciation is on its way.",
    "For every client you refer, I'll donate to your charity.",
    "I'll send flowers to your office each time you refer someone.",
    "Cookies for the team whenever you send a patient my way.",
    "Drinks on me if you send me clients.",
    "I'll buy your team pizza when you refer a client.",
    "We can offer a voucher for each referral.",
    "Here's a gift certificate for your staff.",
    "One free session for every family you send.",
    "In return for referrals, I'll promote your practice.",
    "Let me treat your staff to breakfast for every patient referred to me.",
    "Every new client you send earns your office a reward.",
    "I'd love to buy you a coffee for each patient you pass along.",
    "Your team's coffee is on me.",
    "A Visa card for your trouble.",
    "Te doy un regalo por cada paciente.",
  ];
  const PASS = [
    "I'd love to grab coffee and introduce myself.",
    "My fee is $175 and superbills are available on request.",
    "I'm in network with Aetna and also see clients who pay privately.",
    "Thank you for the care you give this neighborhood.",
    "I offer a sliding scale.",
    "I work with people facing cancer, serious illness and the end of life.",
    "Please send me your flyer and I'll share it with my clients.",
    "I'd be glad to be one of the names you share when a patient asks about counseling.",
    "Thank you for any referrals you feel are a good fit.",
    "I tailor care for each client I see.",
    "You can count on me to follow up within a day.",
    "I see adults and families, in person and by video.",
  ];
  it.each(REFUSE)("refuses: %s", (bad) => {
    expect(valueOffered(bad)).not.toBeNull();
    expect(checkLetter(`${base} ${bad}`).ok).toBe(false);
  });
  it.each(PASS)("lets through: %s", (ok) => {
    expect(valueOffered(ok)).toBeNull();
    expect(checkLetter(`${base} ${ok}`)).toEqual({ ok: true });
  });
  it("'offer a gift card' in her note still yields a letter with no incentive", async () => {
    const note = "offer a gift card";
    expect(askedFor(note, FACTS).filter((a) => a.allowed).map((a) => a.what).join(" ")).not.toMatch(/gift/i);
    const drafts = [CLEAN.replace("Would you be open", "As a thank you, here is a $25 gift card. Would you be open"), CLEAN];
    let i = 0;
    const chat = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: drafts[Math.min(i++, 1)] }) } }] })) as never;
    const r = await writeLetter(card({}), { chat, note, facts: FACTS });
    expect(i).toBe(2);
    expect(valueOffered(r.letter)).toBeNull();
    expect(r.letter).not.toMatch(/gift/i);
    // A model that only ever offers it: no letter at all.
    const stubborn = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: drafts[0] }) } }] })) as never;
    await expect(writeLetter(card({}), { chat: stubborn, note, facts: FACTS })).rejects.toThrow(/referral rules/);
  });
});

describe("card notes", () => {
  const ok = async (t: string) => ({ ok: true as const, text: t });
  it("refuse danger or self-harm with the 988 line, before the privacy check", async () => {
    let asked = false;
    const spy = async (t: string) => ((asked = true), ok(t));
    expect(await checkNote("nurse navigator said one of their patients wants to kill herself", spy)).toBe(CRISIS_NOTE);
    expect(CRISIS_NOTE).toMatch(/988/);
    expect(asked).toBe(false);
  });
  it("refuse anything of value for referrals in plain words", async () => {
    expect(await checkNote("offered a $25 gift card for every client they send", ok)).toMatch(/Nothing of value/);
    expect(await checkNote("goodie basket for each patient they refer", ok)).toMatch(/Nothing of value/);
  });
  it("let an ordinary note through", async () => {
    expect(await checkNote("Front desk said to fax the intake; Thursday afternoons are best.", ok)).toBeNull();
  });
});

const made: string[] = [];
afterAll(async () => {
  if (!hasDb) return;
  if (made.length) {
    await db()`delete from practice_os.approvals where payload ->> 'referral_source_id' in ${db()(made)}`;
    await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
  }
  await closeDb();
});

describe.skipIf(!hasDb)("I sent it, twice", () => {
  async function newCard(name: string) {
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, specialty, npi_type, city, state, zip, is_sample)
      values (${name}, 'Oncology', 'individual', 'Chicago', 'IL', '60614', true) returning id`;
    made.push(row.id);
    return row.id;
  }
  const sentRows = async (id: string) => (await db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_contacts where source_id = ${id} and kind = 'sent_letter'`)[0].n;

  it("logs one sent_letter per approved letter, even pressed twice at once", async () => {
    const id = await newCard("[Sample] Rowan Quillfeather, MD");
    await db()`
      insert into practice_os.approvals (kind, title, preview, payload, status, created_by, decided_at)
      values ('referral_letter', '[Sample] Intro letter', '{}'::jsonb, ${db().json({ referral_source_id: id, subject: "Hi", letter: "x" } as never)}, 'done', 'test:demo-letters', now())`;
    const [a, b] = await Promise.all([logContact(id, { kind: "sent_letter", by: "clinician" }), logContact(id, { kind: "sent_letter", by: "clinician" })]);
    expect(await sentRows(id)).toBe(1);
    expect(a.contact.id).toBe(b.contact.id);
    expect([a.already, b.already].filter(Boolean)).toHaveLength(1);
    expect(a.stage).toBe("contacted");
    expect(b.stage).toBe("contacted");
    const again = await logContact(id, { kind: "sent_letter", by: "clinician" });
    expect(again.already).toBe(true);
    expect(await sentRows(id)).toBe(1);
  });
  it("with no letter approved, once per day", async () => {
    const id = await newCard("[Sample] Sky Quillfeather, MD");
    await logContact(id, { kind: "sent_letter", by: "clinician" });
    await logContact(id, { kind: "sent_letter", by: "clinician" });
    expect(await sentRows(id)).toBe(1);
  });
});
