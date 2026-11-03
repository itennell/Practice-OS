// The coffee debrief and the end-of-life niche (wave-4 demo, scene 4): a
// partner pointing her to "the hospice social worker" is a referral cue, not a
// patient. Care-setting jobs (hospice, palliative care, oncology, grief) read
// as work only when she is told to meet or reach that professional, or the
// role handles referrals, and nothing else in the sentence could be about one
// person. Every patient sentence in those words is still dropped: default
// refuse. Real guard and name-finder; Muse is a fixture. Fictional people only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
loadEnv();

const SRC = { name: "Amara Okafor, MD", organization: "Northside Women's Health" };
const BASE = "I had coffee with Dr. Okafor from Northside Women's Health. They send referrals by fax.";

// About one patient, in hospice or oncology words. None may reach Muse.
const PATIENTS: [string, string[]][] = [
  ["Her patient in hospice wants to meet a therapist.", ["patient in hospice"]],
  ["A man dying of cancer in hospice named Joe needs someone to call.", ["Joe", "dying"]],
  ["My client is on hospice and needs a therapist.", ["client is on hospice"]],
  ["She said I should call the hospice nurse about her.", ["about her"]],
  ["I should meet the hospice social worker because he is dying.", ["dying"]],
  ["He has a hospice nurse now and needs a therapist who does home visits.", ["home visits"]],
  ["The hospice team takes care of her and wants a therapist.", ["takes care of her"]],
  ["I should meet her hospice social worker.", ["her hospice"]],
  ["You should meet Tom Reyes, the hospice chaplain, who has cancer himself.", ["Tom Reyes", "cancer"]],
  ["She said I should meet the hospice social worker who works with her.", ["works with her"]],
  ["One of their patients just went on hospice and wants to meet me.", ["went on hospice"]],
  ["She wants me to call the oncology nurse navigator about a woman with stage four cancer.", ["stage four"]],
  ["Their palliative care team handles referrals for her now that she is dying.", ["dying"]],
  ["You should meet Ruth Abel, the hospice social worker, since her husband just passed away.", ["husband", "Ruth Abel"]],
  ["Linda Park, the oncology nurse navigator, started chemo herself last month and wants to meet me.", ["chemo"]],
  ["I should talk to the palliative care team about the man in room 12.", ["room 12"]],
  ["The man the hospice social worker sees on Fridays wants a therapist.", ["Fridays"]],
  ["Dr. Wong is in our palliative care program and wants to meet me.", ["Wong"]],
  ["She told me to contact the bereavement coordinator because her mom died.", ["mom died"]],
  ["You should call the grief counselor, she is grieving her son.", ["grieving"]],
  ["Joe Banks, the hospice social worker, is dying of cancer and wants to meet.", ["Joe Banks", "dying"]],
  ["I should meet the oncology social worker for the 58-year-old with leukemia.", ["58-year-old", "leukemia"]],
];

// Professionals she was pointed to, or a role that handles referrals. Each must pass.
const PROFESSIONALS: [string, string[]][] = [
  ["She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint", "hospice social worker"]],
  ["You should meet Maria Lopez, the hospice social worker at Glimmerfen.", ["Maria Lopez"]],
  ["She told me to call the palliative care team at Lakeshore about referrals.", ["palliative care team"]],
  ["Their palliative care team handles referrals by fax.", ["palliative care team"]],
  ["She wants me to meet Jenna Cho, the oncology nurse navigator.", ["Jenna Cho"]],
  ["She introduced me to the grief counselor at Hope House.", ["grief counselor"]],
  ["I should reach out to the bereavement coordinator at Orrindale Hospice about referrals.", ["bereavement coordinator"]],
  ["You should talk to the hospice and palliative care team at Northside Hospital about their referrals.", ["hospice and palliative care team"]],
];

describe("hospice and oncology words in the privacy pass (real guard and name-finder)", () => {
  it("has enough cases on both sides", () => {
    expect(PATIENTS.length).toBeGreaterThanOrEqual(12);
    expect(PROFESSIONALS.length).toBeGreaterThanOrEqual(6);
  });

  it.each(PATIENTS)("drops: %s", async (s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).not.toContain(s.slice(0, 25));
    for (const t of toks) expect(c.text).not.toContain(t);
    expect(c.text).toContain("They send referrals by fax.");
  }, 120_000);

  it.each(PROFESSIONALS)("keeps: %s", async (s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).toContain(s);
    for (const t of toks) expect(c.text).toContain(t);
  }, 120_000);

  it("a named hospice professional is found as a professional, so the card can suggest them", async () => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${PROFESSIONALS[0][0]} ${PROFESSIONALS[1][0]}`, SRC);
    expect(c.professionals).toEqual(expect.arrayContaining(["Marisol Quint", "Maria Lopez"]));
  }, 120_000);

  it("the care-role reading never applies without the referral cue", async () => {
    const { withoutCareRoles, isCareRole } = await import("../lib/referrals/debrief");
    // No one told her to meet them, and the role isn't handling referrals: read word for word.
    expect(withoutCareRoles("Linda Park is with the hospice team now.")).toBe("Linda Park is with the hospice team now.");
    expect(withoutCareRoles("The hospice nurse visits her twice a week.")).toBe("The hospice nurse visits her twice a week.");
    // Another health word or a pronoun about someone: read word for word.
    expect(withoutCareRoles("I should meet the hospice nurse, her cancer is back.")).toBe("I should meet the hospice nurse, her cancer is back.");
    expect(withoutCareRoles("You should meet Ana Ruiz, the hospice social worker.")).toBe("You should meet Ana Ruiz, the professional.");
    expect(isCareRole("hospice social worker")).toBe(true);
    expect(isCareRole("the palliative care team")).toBe(true);
    expect(isCareRole("hospice patient")).toBe(false);
    expect(isCareRole("hospice resident")).toBe(false);
    expect(isCareRole("in hospice")).toBe(false);
  });
});

describe("hospice professionals in the field checks", () => {
  const T = `${BASE} She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice. They mostly see adults in active treatment and their families.`;
  const empty = {
    refers_via: null, referral_contact: null, populations: [], needs_from_therapist: null, waitlist: null, payer_mix: null, best_time: null,
    last_meeting_summary: null, connection_points: null, who_else: [], follow_up_points: [],
  };
  async function run(stub: Record<string, unknown>) {
    const { cleanTranscript, checkFields, debriefAllowlist } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(T, SRC);
    const allow = await debriefAllowlist(SRC, c.professionals);
    return checkFields({ ...empty, ...stub } as never, c.text, allow, { professionals: c.professionals, sourceId: "x" });
  }

  it("keeps the hospice social worker she was told to meet, and their families as a group", async () => {
    const r = await run({
      who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: "Orrindale Hospice" }],
      populations: ["adults in active treatment", "their families"],
      referral_contact: "Marisol Quint, the hospice social worker",
    });
    expect(r.rejected).toEqual([]);
    expect(r.fields.who_else.map((w) => w.name)).toEqual(["Marisol Quint"]);
    expect(r.fields.populations).toEqual(["adults in active treatment", "their families"]);
    expect(r.fields.referral_contact).toBe("Marisol Quint, the hospice social worker");
  }, 120_000);

  const REFUSED: [string, Record<string, unknown>][] = [
    ["who_else hospice patient", { who_else: [{ name: "Marisol Quint", role: "hospice patient", organization: "Orrindale Hospice" }] }],
    ["who_else role in hospice", { who_else: [{ name: null, role: "social worker in hospice care for cancer", organization: "Orrindale Hospice" }] }],
    ["who_else org smuggle", { who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: "Orrindale Hospice, dying of cancer" }] }],
    ["contact in hospice", { referral_contact: "Marisol Quint in hospice" }],
    ["contact with health", { referral_contact: "Marisol Quint, the hospice social worker with cancer" }],
    ["summary staff dying", { last_meeting_summary: "They send referrals by fax. Marisol Quint, the hospice social worker, is dying." }],
    ["population one person", { populations: ["their father in hospice"] }],
  ];
  it.each(REFUSED)("refuses %s", async (_id, stub) => {
    const r = await run(stub);
    for (const k of Object.keys(stub)) {
      const v = (r.fields as Record<string, unknown>)[k];
      expect(Array.isArray(v) ? v.length : v).toBeFalsy();
    }
    expect(r.rejected.length + r.unsupported.length).toBeGreaterThan(0);
  }, 120_000);

  it("guesses Muse made are left empty and counted apart from the refusals", async () => {
    const r = await run({ payer_mix: "Mostly Aetna and Cigna", best_time: "Monday mornings", connection_points: "We both trained at Loyola", waitlist: true });
    expect(r.fields.payer_mix).toBeNull();
    expect(r.fields.best_time).toBeNull();
    expect(r.fields.waitlist).toBeNull();
    expect(r.rejected).toEqual([]);
    expect(r.unsupported.map((x) => x.field)).toEqual(expect.arrayContaining(["Insurance and private pay", "Best time to reach them"]));
  }, 120_000);
});

describe("evidence matching reads the same word or number however it was said", () => {
  it("word forms and spelled-out numbers", async () => {
    const { keyTerms, numbersSupported, support, withDigits } = await import("../lib/referrals/debrief");
    expect(keyTerms("calls called calling")).toEqual(["call", "call", "call"]);
    expect(keyTerms("openings")).toEqual(keyTerms("opening"));
    expect(support("Send my openings", "I said I would send my opening times.")).toBe(1);
    expect(withDigits("within two weeks, about twenty-five a month")).toContain("2 weeks");
    expect(numbersSupported("Within 2 weeks", "They need someone within two weeks.")).toBe(true);
    expect(numbersSupported("About 25 a month", "about twenty-five a month")).toBe(true);
    // Still no number she didn't say.
    expect(numbersSupported("Within 3 weeks", "They need someone within two weeks.")).toBe(false);
    expect(support("We both love hiking in Colorado", "We both trained at Loyola.")).toBeLessThan(0.6);
  });
});

describe("the whole debrief: hospice contact end to end, and the two Muse calls run side by side", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { forgetAllowlist } = await import("../lib/aeon/guard");
  const { analyzeDebrief, saveDebrief } = await import("../lib/referrals/debrief");
  const sql = db();
  const ID = "00000000-0000-4000-8000-0000000009c1";
  const T =
    `${BASE} They mostly see adults in active treatment and their families. ` +
    "One of their patients, a sixty two year old man, just finished chemo. " +
    "She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice. " +
    "I said I would send my openings and a flyer next week.";
  const FIELDS = {
    refers_via: "fax",
    populations: ["adults in active treatment", "their families"],
    who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: "Orrindale Hospice" }],
    follow_up_points: ["Send my openings and a flyer next week"],
    payer_mix: "Mostly Medicare",
  };
  const LETTER =
    "Dear Amara Okafor, MD,\n\nThank you for meeting me for coffee. It was good to hear that your office sends referrals by fax. As I said, I will " +
    "send my openings and a flyer next week.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";
  const cleanup = async () => {
    await sql`delete from practice_os.approvals where payload ->> 'referral_source_id' = ${ID}`;
    await sql`delete from practice_os.memories where source = 'referral_debrief'`;
    await sql`delete from practice_os.referral_sources where suggested_from = ${ID}`;
    await sql`delete from practice_os.referral_sources where id = ${ID}`;
  };
  beforeAll(async () => {
    await cleanup();
    await sql`insert into practice_os.referral_sources (id, name, organization, specialty, npi_type, credential, city, state, stage, is_sample)
      values (${ID}, 'Amara Okafor, MD', 'Northside Women''s Health', 'Oncology', 'individual', 'MD', 'Chicago', 'IL', 'contacted', true)`;
    forgetAllowlist();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it("suggests the hospice social worker, drops the patient, and drafts the follow-up while the profile is filled in", async () => {
    const calls: { feature: string; start: number; end: number; text: string }[] = [];
    const DELAY = 400;
    const chat = (async (feature: string, params: { messages: unknown[] }) => {
      const start = Date.now();
      await new Promise((r) => setTimeout(r, DELAY));
      calls.push({ feature, start, end: Date.now(), text: JSON.stringify(params.messages) });
      const message =
        feature === "referral_debrief"
          ? { role: "assistant", content: null, tool_calls: [{ id: "c", type: "function", function: { name: "record_debrief", arguments: JSON.stringify(FIELDS) } }] }
          : { role: "assistant", content: JSON.stringify({ subject: "Thank you for coffee", letter: LETTER }) };
      return { choices: [{ index: 0, message }] };
    }) as never;
    const steps: string[] = [];
    const r = await analyzeDebrief(ID, { transcript: T }, { chat, onStep: (s) => steps.push(s) });
    if (r.status !== "ready") throw new Error(r.status);
    expect(steps).toEqual(["privacy", "profile", "follow_up"]);
    // Neither call heard the patient.
    for (const c of calls) for (const w of ["sixty two", "chemo"]) expect(c.text).not.toContain(w);
    // Side by side: the letter call started before the profile call came back.
    const profile = calls.find((c) => c.feature === "referral_debrief")!;
    const letter = calls.find((c) => c.feature === "referral_follow_up")!;
    expect(letter.start).toBeLessThan(profile.end);
    expect(r.draft.follow_up?.letter).toContain("openings and a flyer");
    expect(r.draft.fields.who_else.map((w) => w.name)).toEqual(["Marisol Quint"]);
    expect(r.draft.fields.populations).toEqual(["adults in active treatment", "their families"]);
    // "Mostly Medicare" was never said: empty, counted, not listed.
    expect(r.draft.fields.payer_mix).toBeNull();
    expect(r.draft.rejected).toEqual([]);
    expect(r.draft.not_said).toBe(1);

    // She ticks Marisol Quint; the save's own checks pass her too.
    const saved = await saveDebrief(ID, {
      fields: { ...r.draft.fields, who_else: r.draft.fields.who_else.map((w) => ({ ...w, add: true })) },
      follow_up: r.draft.follow_up,
      professionals: r.draft.professionals,
    });
    expect(saved.suggested.map((s) => s.name)).toEqual(["[Sample] Marisol Quint"]);
    const dump = JSON.stringify(await sql`select * from practice_os.referral_sources where id = ${ID} or suggested_from = ${ID}`);
    for (const w of ["sixty", "chemo"]) expect(dump).not.toContain(w);
  }, 120_000);
});
