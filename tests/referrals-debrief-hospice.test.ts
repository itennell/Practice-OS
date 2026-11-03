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
  // PR #139 adversarial review, round 1. A1: a health word in the slot between setting and job.
  ["You should meet Marisol Quint, the hospice suicidal social worker.", ["suicidal"]],
  ["Their hospice widowed team handles referrals.", ["widowed"]],
  ["You should meet the hospice dying nurse at Orrindale Hospice.", ["dying"]],
  ["You should call the oncology leukemia-patient navigator about referrals.", ["leukemia"]],
  ["She said I should meet the hospice patient-family team.", ["patient-family"]],
  ["You should meet Marisol Quint, the hospice terminal social worker.", ["terminal"]],
  ["You should meet the hospice grieving social worker.", ["grieving social"]],
  // A2: something after "handles referrals".
  ["Their grief counselor takes referrals for someone whose spouse passed.", ["spouse passed"]],
  ["Their palliative care team handles referrals for a man on a ventilator.", ["ventilator"]],
  ["The hospice social worker handles referrals, and one of them is actively passing.", ["actively passing"]],
  // B: someone who isn't she or he.
  ["I should call the palliative care team, they have someone who needs a therapist right away.", ["they have someone"]],
  ["You should meet the hospice social worker, who referred someone after a suicide attempt.", ["suicide attempt"]],
  ["You should meet the hospice social worker for the referral; they have one on DNR status.", ["DNR"]],
  ["You should meet the h0spice social worker, she is d1ying.", ["d1ying"]],
  ["You should meet the grief counselor; they refer people whose kids took their own lives.", ["took their own lives"]],
  ["You should meet the hospice nurse, somebody there has metastatic breast cancer.", ["metastatic"]],
  ["I should call the oncology nurse navigator about the person with carcinoma.", ["carcinoma"]],
  ["You should meet the hospice social worker, the one on comfort care asked for a therapist.", ["comfort care"]],
  ["She said I should call the palliative care team because someone there has weeks left.", ["weeks left"]],
  ["You should meet the oncology social worker; their mastectomy patient wants a therapist.", ["mastectomy"]],
  ["You should talk to the hospice team about the one in remission who wants therapy.", ["remission"]],
  ["You should meet the hospice social worker, someone she sees is bedbound now.", ["bedbound"]],
  ["You should meet the hospice nurse; whose dad had a brain bleed, I forget.", ["brain bleed"]],
  ["I should call the palliative care team about someone with Parkinson's who needs a therapist.", ["Parkinson"]],
  ["You should meet the hospice social worker, they have a patient with end stage renal disease.", ["renal"]],
  ["You should call the hospice chaplain, they will be with them until the end.", ["until the end"]],
  ["You should meet the grief counselor; someone there killed himself last spring.", ["killed himself"]],
  ["I should talk to the hospice team about the one who had an overdose and wants a therapist.", ["overdose"]],
  ["You should meet the hospice social worker, they just had a loss and want to call me.", ["had a loss"]],
  ["You should meet the oncology nurse navigator, somebody on the leukaemia ward wants a therapist.", ["leukaemia"]],
  ["She told me to email the hospice social worker about a person with kidney failure.", ["kidney failure"]],
  ["You should meet the grief counselor, one with a husband who passed wants to call.", ["passed"]],
  ["You should meet the palliative care team, they're caring for someone who is d y i n g.", ["caring for someone"]],
  ["Call the hospice social worker about them, they are not eating anymore.", ["not eating"]],
  ["You should meet the hospice social worker; their own diagnosis is cancer.", ["diagnosis"]],
  ["You should meet the hospice nurse, she said her cancer came back.", ["cancer came back"]],
  ["You should meet the oncology nurse navigator, h3 is in chem0 now.", ["chem0"]],
  ["Their hospice social worker handles referrals; one of them died yesterday.", ["died"]],
  ["You should meet the hospice and palliative care team at Northside Hospital, someone there is terminal.", ["terminal"]],
  ["You should meet the bereavement coordinator, whose son passed away in May.", ["passed away"]],
  ["The hospice social worker said they have a person on a ventilator who wants a therapist.", ["ventilator"]],
  // Round 2. Health words are allowed only right after a group ("adults in cancer treatment") or inside a vetted job.
  ["They just went on hospice and want to meet a therapist.", ["went on hospice"]],
  ["They are actively dying and want to meet a therapist.", ["actively dying"]],
  ["They relapsed and need a therapist this week.", ["relapsed"]],
  ["Their team lost a nurse to cancer and wants a grief therapist.", ["lost a nurse"]],
  ["Their families are grieving a death this week and want a therapist.", ["grieving a death"]],
  ["The latest referral has metastatic cancer and wants a therapist.", ["metastatic"]],
  ["The caller has pancreatic cancer and wants a therapist.", ["pancreatic"]],
  ["Referral number two is dying and needs a therapist.", ["number two"]],
  ["You should meet the hospice medical director, who is dying.", ["who is dying"]],
  ["They are recovering from surgery and want to meet a therapist.", ["surgery"]],
  ["Their newest referral just got out of rehab and needs a therapist.", ["rehab"]],
  ["The referral they sent last week is on comfort care now and wants to meet.", ["comfort care"]],
  // One identifiable referral, no health word.
  ["She wants me to call about the referral for my neighbor.", ["neighbor"]],
  ["She has a referral for the young adult who just moved here with no insurance.", ["young adult"]],
  ["She wants to refer her coworker to me.", ["coworker"]],
  ["They want to send me the one they mentioned on Tuesday.", ["the one they mentioned"]],
  ["She told me about someone who needs a therapist this week.", ["told me about someone"]],
  ["She wants to refer the roommate of a patient to me.", ["roommate"]],
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
  // Round 2: the demo's natural phrasings of the scripted hospice contact (and the staff around it).
  ["Their intake coordinator, Rosa Diaz, handles the referrals.", ["Rosa Diaz"]],
  ["Rosa Diaz at the front desk is the one who sends them.", ["Rosa Diaz"]],
  ["And she said I should meet the hospice social worker at Orrindale Hospice, Marisol Quint.", ["Marisol Quint"]],
  ["She wants me to meet Marisol Quint, the hospice social worker at Orrindale Hospice, because they get a lot of families asking about grief counseling.", ["Marisol Quint", "grief counseling"]],
  ["She said I should talk to Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["She also said their palliative care team handles referrals by fax.", ["palliative care team"]],
  ["You should meet Marisol Quint, the hospice social worker at Orrindale Hospice, she told me.", ["Marisol Quint"]],
  ["She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice, since they see a lot of patients in cancer treatment and their families.", ["Marisol Quint"]],
  ["She said I should reach out to Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["Rosa Diaz handles referrals, she's their referral coordinator.", ["Rosa Diaz"]],
  ["Marisol Quint, she's the hospice social worker at Orrindale Hospice, she told me to call her.", ["Marisol Quint"]],
  ["You should meet Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["Their palliative care nurse handles the referrals.", ["palliative care nurse"]],
];

// Names each demo phrasing must find as a professional (so the card can suggest them).
const DEMO_PROFESSIONALS: [string, string][] = [
  ["Their intake coordinator, Rosa Diaz, handles the referrals.", "Rosa Diaz"],
  ["Rosa Diaz at the front desk is the one who sends them.", "Rosa Diaz"],
  ["And she said I should meet the hospice social worker at Orrindale Hospice, Marisol Quint.", "Marisol Quint"],
  ["She wants me to meet Marisol Quint, the hospice social worker at Orrindale Hospice, because they get a lot of families asking about grief counseling.", "Marisol Quint"],
  ["She said I should talk to Marisol Quint, the hospice social worker at Orrindale Hospice.", "Marisol Quint"],
  ["You should meet Marisol Quint, the hospice social worker at Orrindale Hospice, she told me.", "Marisol Quint"],
  ["She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice, since they see a lot of patients in cancer treatment and their families.", "Marisol Quint"],
  ["She said I should reach out to Marisol Quint, the hospice social worker at Orrindale Hospice.", "Marisol Quint"],
  ["Rosa Diaz handles referrals, she's their referral coordinator.", "Rosa Diaz"],
  ["Marisol Quint, she's the hospice social worker at Orrindale Hospice, she told me to call her.", "Marisol Quint"],
];

describe("hospice and oncology words in the privacy pass (real guard and name-finder)", () => {
  it("has enough cases on both sides", () => {
    expect(PATIENTS.length).toBeGreaterThanOrEqual(60);
    expect(PROFESSIONALS.length).toBeGreaterThanOrEqual(6);
  });

  it.each(PATIENTS)("drops: %s", async (s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    // A semicolon splits the sentence: a harmless "You should meet the grief counselor;" may stay, the part about someone never.
    const about = s.includes(";") ? s.slice(s.indexOf(";") + 1).trim() : s;
    expect(c.text).not.toContain(about.slice(0, 25));
    for (const t of toks) expect(c.text).not.toContain(t);
    expect(c.text).toContain("They send referrals by fax.");
  }, 120_000);

  it.each(PROFESSIONALS)("keeps: %s", async (s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).toContain(s);
    for (const t of toks) expect(c.text).toContain(t);
  }, 120_000);

  it.each(DEMO_PROFESSIONALS)("finds the professional in: %s", async (s, name) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.professionals).toContain(name);
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

  it("keeps their palliative care nurse as the contact and the grief counselor at Hope House", async () => {
    const { cleanTranscript, checkFields, debriefAllowlist } = await import("../lib/referrals/debrief");
    const t = `${BASE} Their palliative care nurse handles the referrals. She introduced me to the grief counselor at Hope House.`;
    const c = await cleanTranscript(t, SRC);
    const allow = await debriefAllowlist(SRC, c.professionals);
    const r = await checkFields(
      { ...empty, referral_contact: "their palliative care nurse", who_else: [{ name: null, role: "grief counselor", organization: "Hope House" }] } as never,
      c.text,
      allow,
      { professionals: c.professionals, sourceId: "x" },
    );
    expect(r.rejected).toEqual([]);
    expect(r.fields.referral_contact).toBe("their palliative care nurse");
    expect(r.fields.who_else.map((w) => w.role)).toEqual(["grief counselor"]);
  }, 120_000);

  const REFUSED: [string, Record<string, unknown>][] = [
    ["who_else hospice patient", { who_else: [{ name: "Marisol Quint", role: "hospice patient", organization: "Orrindale Hospice" }] }],
    ["who_else role in hospice", { who_else: [{ name: null, role: "social worker in hospice care for cancer", organization: "Orrindale Hospice" }] }],
    ["who_else org smuggle", { who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: "Orrindale Hospice, dying of cancer" }] }],
    ["contact in hospice", { referral_contact: "Marisol Quint in hospice" }],
    ["contact with health", { referral_contact: "Marisol Quint, the hospice social worker with cancer" }],
    ["summary staff dying", { last_meeting_summary: "They send referrals by fax. Marisol Quint, the hospice social worker, is dying." }],
    ["population one person", { populations: ["their father in hospice"] }],
    // PR #139 review: a health word in the role's middle slot, a unit as a place, health words she never put together.
    ["who_else hospice dying nurse", { who_else: [{ name: null, role: "hospice dying nurse", organization: "Orrindale Hospice" }] }],
    ["who_else leukemia-patient navigator", { who_else: [{ name: null, role: "oncology leukemia-patient navigator", organization: "Orrindale Hospice" }] }],
    ["who_else patient-family team", { who_else: [{ name: null, role: "hospice patient-family team", organization: "Orrindale Hospice" }] }],
    ["who_else terminal social worker", { who_else: [{ name: "Marisol Quint", role: "hospice terminal social worker", organization: "Orrindale Hospice" }] }],
    ["who_else local hospice unit", { who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: "the local hospice unit" }] }],
    ["contact terminal social worker", { referral_contact: "Marisol Quint, hospice terminal social worker" }],
    ["contact suicidal social worker", { referral_contact: "Marisol Quint, the hospice suicidal social worker" }],
    ["population new health words", { populations: ["adults with metastatic cancer"] }],
    ["population recombined", { populations: ["families in active treatment"] }],
    ["follow-up hospice person", { follow_up_points: ["Ask the hospice social worker about the one on comfort care"] }],
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

describe("the follow-up letter is read sentence by sentence", () => {
  const facts = { clinician: { name: "Dana Reyes", credential: "LCPC", practice: "Reyes Counseling PLLC", neighborhood: null, city: "Chicago" } };
  const cleaned =
    "I had coffee with Dr. Okafor from Northside Women's Health. They send referrals by fax. They mostly see adults in active treatment and their families. " +
    "She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice. I said I would send my openings and a flyer next week.";
  const wrap = (middle: string) =>
    `Dear Amara Okafor, MD,\n\nThank you for meeting me for coffee. ${middle} As I said, I will send my openings and a flyer next week.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC`;
  const BAD = [
    "I was so sorry to hear that one of your patients is dying in hospice.",
    "I hope the man who just finished chemo is doing well.",
    "Please tell the woman in hospice I said hello.",
    "I hope they are comfortable on comfort care.",
    "I can see the family whose son passed away.",
    "I'd be glad to help your patient with metastatic cancer.",
    "I'm glad Marisol Quint is coping with her diagnosis.",
    "I can see someone with a brain bleed soon.",
    // Round 2.
    "Please tell Marisol Quint I hope her recovery goes well.",
    "I can see the one they mentioned this week.",
    "I hope everyone there is healing and feeling better.",
    "Please tell them I hope they get well soon.",
    "I'm sorry your team lost a nurse to cancer.",
    "I hope the caller with pancreatic cancer finds help.",
  ];
  it.each(BAD)("refuses a letter with: %s", async (line) => {
    const { letterAboutAPerson } = await import("../lib/referrals/debrief");
    expect(letterAboutAPerson(wrap(line), SRC, facts, cleaned)).not.toBeNull();
  });
  it("passes a letter that looks forward to meeting the hospice social worker she was told to meet", async () => {
    const { letterAboutAPerson } = await import("../lib/referrals/debrief");
    const line = "I look forward to meeting Marisol Quint, the hospice social worker at Orrindale Hospice.";
    expect(letterAboutAPerson(wrap(line), SRC, facts, cleaned, ["Marisol Quint"])).toBeNull();
  });
  it("passes a plain thank-you built from the debrief", async () => {
    const { letterAboutAPerson } = await import("../lib/referrals/debrief");
    expect(letterAboutAPerson(wrap("It was good to hear that your office sends referrals by fax and sees adults in active treatment and their families."), SRC, facts, cleaned)).toBeNull();
  });
  it("refuses a letter that is mostly not from the debrief", async () => {
    const { letterAboutAPerson } = await import("../lib/referrals/debrief");
    const made = wrap("Our shared love of sailing, jazz records, vintage bicycles and Portuguese cooking made the afternoon memorable, especially your stories about Lisbon harbors and Miles Davis.");
    expect(letterAboutAPerson(made, SRC, facts, cleaned)).not.toBeNull();
  });
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
    "Dear Amara Okafor, MD,\n\nThank you for meeting me for coffee. It was good to hear that your office sends referrals by fax, and that you mostly see " +
    "adults in active treatment and their families. I look forward to meeting Marisol Quint, the hospice social worker at Orrindale Hospice. " +
    "As I said, I will send my openings and a flyer next week.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";
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
