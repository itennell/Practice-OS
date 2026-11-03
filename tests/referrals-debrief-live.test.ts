// The coffee debrief end to end, as the live demo runs it: the real name-finder (the NER model in
// .cache/models), the real guard, no stubs, the [Sample] Quillmere Oncology Group card as the partner,
// and a whole 45-second debrief around each line (the referral process, payers, a patient story that
// must be withheld, the best time, her follow-up). Each demo phrasing must keep the professional and
// pass the field checks; each smuggle must be dropped. Fictional people and offices only.
import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { modelCacheDir } from "../lib/aeon/phi-classifier";
loadEnv();

const SRC = { name: "[Sample] Quillmere Oncology Group", organization: "[Sample] Quillmere Oncology Group" };
const HEAD =
  "I just had coffee with the practice manager at Quillmere Oncology Group. They send referrals by fax, and the oncology nurse navigator handles them. " +
  "Their patients usually wait about three months for a therapist, so they really need someone with openings. Most of their patients have Blue Cross PPO or Medicare. " +
  "One of their patients, a sixty two year old man, just finished chemo. The best time to call is Thursday afternoons.";
const TAIL = "I said I would send my openings and a flyer next week.";
const PATIENT = ["sixty two", "chemo"];
const transcript = (line: string) => `${HEAD} ${line} ${TAIL}`;

// Every must-keep demo phrasing (tests/referrals-debrief-hospice.test.ts), now inside a whole debrief.
const KEEP: [string, string[]][] = [
  ["She said I should meet Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint", "hospice social worker"]],
  ["You should meet Maria Lopez, the hospice social worker at Glimmerfen.", ["Maria Lopez"]],
  ["She told me to call the palliative care team at Lakeshore about referrals.", ["palliative care team"]],
  ["Their palliative care team handles referrals by fax.", ["palliative care team"]],
  ["She wants me to meet Jenna Cho, the oncology nurse navigator.", ["Jenna Cho"]],
  ["She introduced me to the grief counselor at Hope House.", ["grief counselor"]],
  ["I should reach out to the bereavement coordinator at Orrindale Hospice about referrals.", ["bereavement coordinator"]],
  ["You should talk to the hospice and palliative care team at Northside Hospital about their referrals.", ["hospice and palliative care team"]],
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
  ["Their intake coordinator Rosa Diaz handles all of it.", ["Rosa Diaz"]],
  ["She also told me to reach out to Marisol Quint, who's the hospice social worker over at Orrindale Hospice.", ["Marisol Quint"]],
  ["Rosa Diaz is the referral coordinator there and she's the one to ask for.", ["Rosa Diaz"]],
  ["The person who handles referrals is Rosa Diaz at the front desk.", ["Rosa Diaz"]],
  ["Their hospice social worker, Marisol Quint, is someone I should definitely meet, since lots of their patients' families need grief counseling.", ["Marisol Quint", "grief counseling"]],
  ["She gave me a name: Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["She told me Marisol Quint is the hospice social worker at Orrindale Hospice and I should talk with her.", ["Marisol Quint"]],
  ["They see a lot of people with disabilities and their caregivers.", ["people with disabilities"]],
  ["Dr. Okafor also wants me to meet Marisol Quint, she runs social work at Orrindale Hospice.", ["Marisol Quint"]],
  ["She mentioned Marisol Quint is the hospice social worker at Orrindale Hospice and said she'd make an introduction.", ["Marisol Quint"]],
  ["Her top suggestion was Marisol Quint, the social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["Also, hospice social worker Marisol Quint at Orrindale Hospice would be good to meet, she said.", ["Marisol Quint"]],
  ["Next step: meet Marisol Quint, the hospice social worker at Orrindale Hospice.", ["Marisol Quint"]],
  ["Intake coordinator Rosa Diaz is who sends them out.", ["Rosa Diaz"]],
  ["Rosa Diaz handles intake there.", ["Rosa Diaz"]],
  ["Ask for Rosa Diaz in intake.", ["Rosa Diaz"]],
  ["Rosa Diaz at intake is the person to ask for.", ["Rosa Diaz"]],
  ["Talk to Rosa Diaz, she coordinates intake.", ["Rosa Diaz"]],
  ["Her top suggestion was Marisol Quint, who runs social work at Orrindale Hospice.", ["Marisol Quint"]],
  ["Intake coordinator Rosa Diaz handles intake.", ["Rosa Diaz"]],
  ["She mentioned that Marisol Quint, the hospice social worker at Orrindale Hospice, takes a lot of referrals and is the person to ask for there.", ["Marisol Quint"]],
];
const SMUGGLES: [string, string[]][] = [
  ["Next step: meet Joe Banks, the hospice patient who is dying.", ["Joe Banks", "dying"]],
  ["Rosa Diaz in intake has breast cancer, she said.", ["breast cancer"]],
  ["Hospice social worker Joe Banks, whose wife has ALS, wants to meet.", ["Joe Banks", "ALS"]],
  ["Her top suggestion was Joe Banks, who is on hospice now.", ["Joe Banks", "on hospice"]],
  ["Her top suggestion was Marisol Quint, who runs social work at Orrindale Hospice and just started chemo.", ["chemo"]],
  ["Intake coordinator Rosa Diaz handles intake, but she is out on medical leave.", ["medical leave"]],
  ["Intake coordinator Rosa Diaz handles intake for her son, who is in rehab.", ["rehab"]],
  ["She mentioned that Marisol Quint, the hospice social worker at Orrindale Hospice, is dying and is the person to ask for there.", ["dying"]],
  ["She mentioned that Joe Banks takes a lot of referrals and is the person to ask for, since his cancer came back.", ["cancer came back"]],
  ["Ask for Rosa Diaz in intake about the man in room 12.", ["room 12"]],
  ["Talk to Rosa Diaz, she coordinates intake for her husband now.", ["husband"]],
  ["Also, hospice social worker Joe Banks at Orrindale Hospice is a patient there, she said.", ["Joe Banks", "a patient there"]],
  ["Next step: call Joe Banks, the 70-year-old at Orrindale Hospice.", ["70-year-old"]],
  ["Her top suggestion was the hospice patient Joe Banks.", ["Joe Banks"]],
  ["Dr. Okafor also wants me to meet Joe Banks, she runs social work at Orrindale Hospice and her mom just died.", ["her mom just died"]],
  ["Rosa Diaz at intake is the person to ask for, and she was just diagnosed with lupus.", ["diagnosed"]],
  ["She said she'd make an introduction to Joe Banks, who has stage four cancer.", ["stage four"]],
  ["Next step: meet Kevin Ortiz at Orrindale Hospice, he is in their palliative care program.", ["Kevin Ortiz", "palliative care program"]],
  ["Her top suggestion was a client named Ana at the hospice.", ["Ana"]],
  ["Intake coordinator Rosa Diaz is who sends them out, she is in recovery.", ["recovery"]],
  ["Hospice social worker Joe Banks wants to meet, he relapsed last week.", ["relapsed"]],
  ["Next step: meet the hospice social worker for the young adult who just moved here.", ["young adult"]],
  ["She mentioned that Rosa Diaz takes a lot of referrals, she is the one they mentioned with the overdose.", ["overdose"]],
  ["Ask for Rosa Diaz in intake; she has long covid and works part time.", ["long covid"]],
];

// How a transcript of the scripted line can come back: no comma, a lower-case place word, the
// appositive cut into its own sentence, a second plain mention later, filler words.
const SCRIPT_VARIANTS = [
  "You should meet Marisol Quint, the hospice social worker at Orrindale Hospice.",
  "You should meet Marisol Quint the hospice social worker at Orrindale Hospice.",
  "You should meet Marisol Quint, the hospice social worker at Orrindale hospice.",
  "You should meet Marisol Quint. She's the hospice social worker at Orrindale Hospice.",
  "She said, you should meet Marisol Quint, the hospice social worker at Orrindale Hospice.",
  "And she said, You should meet Marisol Quint, the hospice social worker at Orrindale Hospice.",
  "Uh, she said I should meet, um, Marisol Quint, the hospice social worker at Orrindale Hospice.",
  "You should meet Marisol Quint, the hospice social worker at Orrindale Hospice. I'll email Marisol Quint next week.",
  "You should meet Marisol Quint, the hospice social worker at Orrindale Hospice. I'll reach out to Marisol next week.",
];

describe("the live debrief path: real name-finder and guard, no stubs", () => {
  it("runs on the real model", () => {
    expect(existsSync(modelCacheDir())).toBe(true);
  });

  it.each(KEEP)("keeps, in a whole debrief: %s", async (line, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(transcript(line), SRC);
    expect(c.text).toContain(line);
    for (const t of toks) expect(c.text).toContain(t);
    for (const w of PATIENT) expect(c.text).not.toContain(w);
    expect(c.text).toContain("They send referrals by fax");
  }, 120_000);

  it.each(SCRIPT_VARIANTS)("keeps the scripted hospice contact as transcribed: %s", async (line) => {
    const { cleanTranscript, checkFields, debriefAllowlist } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(transcript(line), SRC);
    expect(c.professionals).toContain("Marisol Quint");
    expect(c.text).toContain("Marisol Quint");
    for (const w of PATIENT) expect(c.text).not.toContain(w);
    // And the suggested contact passes every field check with the real guard.
    const allow = await debriefAllowlist(SRC, c.professionals);
    const empty = {
      refers_via: null, referral_contact: null, populations: [], needs_from_therapist: null, waitlist: null, payer_mix: null, best_time: null,
      last_meeting_summary: null, connection_points: null, who_else: [], follow_up_points: [],
    };
    const org = /Orrindale hospice/.test(line) ? "Orrindale hospice" : "Orrindale Hospice";
    const r = await checkFields(
      { ...empty, refers_via: "fax", who_else: [{ name: "Marisol Quint", role: "hospice social worker", organization: org }], follow_up_points: ["Send my openings and a flyer next week"] } as never,
      c.text,
      allow,
      { professionals: c.professionals, sourceId: "x" },
    );
    expect(r.rejected).toEqual([]);
    expect(r.fields.who_else.map((w) => w.name)).toEqual(["Marisol Quint"]);
  }, 120_000);

  it.each(SMUGGLES)("drops, in a whole debrief: %s", async (line, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(transcript(line), SRC);
    const about = line.includes(";") ? line.slice(line.indexOf(";") + 1).trim() : line;
    expect(c.text).not.toContain(about.slice(0, 25));
    for (const t of toks) expect(c.text).not.toContain(t);
    for (const w of PATIENT) expect(c.text).not.toContain(w);
  }, 120_000);
});
