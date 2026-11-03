// The second privacy review of the coffee debrief (PR #129): 33 sentences about
// one person that must never reach Muse, 15 professional facts that must, the
// fee lines, adversarial model output for every field, crafted WAV headers and
// forged saves. Real guard and name-finder; no live model. Fictional people only.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
loadEnv();

const SRC = { name: "Amara Okafor, MD", organization: "Northside Women's Health" };
const BASE = "I had coffee with Dr. Okafor from Northside Women's Health. They send referrals by fax.";

const LEAKS: [string, string, string[]][] = [
  ["L1 first-name only", "Maria's scans came back clean last week.", ["Maria", "scans"]],
  ["L2 relationship", "The mom of one of her kids is struggling with drinking.", ["drinking", "mom of"]],
  ["L3 the Garcia boy", "The Garcia boy is on a waitlist for the IOP.", ["Garcia"]],
  ["L4 Dr. patient w/ verb", "Dr. Wong, a retired surgeon who's now in hospice with us, wants to talk to someone.", ["Wong", "hospice"]],
  ["L4b Dr. patient no verb", "We have Dr. Wong in hospice right now.", ["Wong", "hospice"]],
  ["L4c Dr. patient appositive", "Dr. Wong, a retired surgeon, is in our hospice program now.", ["Wong", "hospice"]],
  ["L5 staff diagnosed", "Rosa Diaz, our nurse, was just diagnosed with cancer.", ["cancer", "diagnosed"]],
  ["L5b staff chemo", "Rosa Diaz, our nurse, is out on leave for her chemo.", ["chemo"]],
  ["L5c staff appositive + health", "Linda Park, the nurse navigator, has stage four breast cancer.", ["breast cancer"]],
  ["L6 room number", "The man in room 412 asked about therapy.", ["412"]],
  ["L7 bed number", "Bed 3 has been asking for a counselor.", ["Bed 3"]],
  ["L8 age digits", "The 72-year-old in 4B wants a therapist.", ["4B", "72"]],
  ["L8b age words", "The seventy-two year old in 4B wants a therapist.", ["4B", "seventy-two"]],
  ["L9 visit dates", "She saw her on October 14th and again on the 21st.", ["October 14th"]],
  ["L10 single first name", "Kevin is coming in on Monday the 3rd for his intake.", ["Kevin"]],
  ["L11 pronoun chain diag", "She said her daughter has leukemia.", ["leukemia"]],
  ["L11b pronoun depressed", "She mentioned he has been really depressed since the move.", ["depressed"]],
  ["L11c pronoun after staff", "Brian Lee, the office manager, said she is still not sleeping and is terrified of the dark.", ["sleeping", "terrified"]],
  ["L12 Spanish name", "Su paciente Juan tiene cáncer.", ["Juan", "cáncer"]],
  ["L12b Spanish no name", "Una paciente de cuarenta años está embarazada.", ["embarazada", "paciente"]],
  ["L13 run-on", "Linda Park, the nurse navigator, handles their referrals and she mentioned that the woman she sees on Thursdays, the one with the eating disorder, keeps asking about evening sessions and wants someone who takes Aetna.", ["eating disorder", "Thursdays"]],
  ["L14 Mrs surname", "Mrs. Henderson in the oncology wing would love a therapist.", ["Henderson"]],
  ["L15 first name + lost", "Ana from the support group lost her job and her insurance.", ["Ana "]],
  ["L16 lowercase name", "maria lopez has anxiety and wants weekly sessions.", ["maria", "lopez"]],
  ["L17 friend name", "Her friend Jessica has panic attacks.", ["Jessica", "panic"]],
  ["L18 nephew NICU", "Her nephew is in the NICU.", ["nephew", "NICU"]],
  ["L19 twins autism", "The twins in her practice both have autism.", ["twins", "autism"]],
  ["L20 pastor wife stroke", "The pastor at St. Mark's is struggling after his wife's stroke.", ["stroke"]],
  ["L21 teen self-harm-adjacent", "The Johnson girl stopped eating again.", ["Johnson", "eating"]],
  ["L22 the boy in 3", "The boy in bed 3 keeps asking for his mom.", ["bed 3"]],
  ["L23 dr title patient sees", "Dr. Patel is one of ours, she's been seeing us for her MS.", ["Patel", "MS"]],
  ["L24 OB w/ patient role", "Dr. Kim, the cardiologist, is actually here for her own heart failure.", ["heart failure"]],
  ["L25 surname only", "Hernandez wants to start therapy next month.", ["Hernandez"]],
];
// professional facts that should survive
const KEEPS: [string, string, string[]][] = [
  ["K1 their patients payer", "Most of their patients are on Medicaid or BlueCross.", ["Medicaid"]],
  ["K2 new moms population", "They see a lot of new moms with postpartum anxiety.", ["new moms"]],
  ["K3 waitlist", "Their patients usually wait about three months for a therapist.", ["three months"]],
  ["K4 best time", "Dr. Okafor said the best time to call is Tuesday mornings before 10.", ["Tuesday"]],
  ["K5 needs", "She wants a therapist who takes Medicaid and has evening hours.", ["evening hours"]],
  ["K6 partner waitlist", "Dr. Okafor has a waitlist of about 40 people.", ["waitlist"]],
  ["K7 staff wants to meet", "Jenna Cho, the oncology nurse navigator at Lakeshore Cancer Center, wants to meet me.", ["Jenna Cho"]],
  ["K8 staff said", "Linda Park, the nurse navigator, said they need someone who speaks Spanish.", ["Spanish"]],
  ["K9 cancer population", "They mostly refer adults in cancer treatment who need help coping.", ["cancer treatment"]],
  ["K10 Dr's patients", "Dr. Okafor's patients are mostly new parents.", ["new parents"]],
  ["K11 clients a month", "Her office refers about five clients a month to outside therapists.", ["five clients"]],
  ["K12 portal", "Referrals go through their Epic portal and the front desk coordinator checks it daily.", ["Epic"]],
  ["K13 staff has", "Rosa Diaz, our nurse, has the referral list.", ["Rosa Diaz"]],
  ["K14 Dr title colleague", "She told me to meet Dr. Samuel Reed, a psychiatrist at Lakeshore.", ["Samuel Reed"]],
  ["K15 grief population", "They see a lot of families dealing with grief after a loss.", ["grief"]],
];
const FEES: [string, string][] = [
  ["F1 gift card", "She offered to send me a $25 Starbucks gift card for every client I take."],
  ["F2 lunch exchange", "Their last therapist bought the staff lunch every month in exchange for referrals."],
  ["F3 percentage", "She asked if I would give them 10 percent of the first session fee."],
  ["F4 spanish", "Ella me ofreció cincuenta dólares por cada referido."],
  ["F5 kickback word", "The other practice gives them a kickback for each referral."],
  ["F6 free sessions", "She wants me to give their staff free therapy sessions if they send people over."],
];


// Default refuse: every leak probe is dropped before Muse, every professional fact passes.
describe("the allow-list privacy pass (real guard and name-finder)", () => {
  it.each(LEAKS)("drops %s", async (_id, s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).not.toContain(s.slice(0, 25));
    for (const t of toks) expect(c.text).not.toContain(t);
    // The business sentences around it still pass.
    expect(c.text).toContain("They send referrals by fax.");
  }, 120_000);

  it.each(KEEPS)("keeps %s", async (_id, s, toks) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).toContain(s);
    for (const t of toks) expect(c.text).toContain(t);
  }, 120_000);

  it.each(FEES)("drops fee talk %s before Muse and flags it", async (_id, s) => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${s}`, SRC);
    expect(c.text).not.toContain(s.slice(0, 20));
    expect(c.fee).not.toBeNull();
  }, 120_000);

  it("staff names introduced with a role or title are professionals", async () => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(`${BASE} ${KEEPS.map(([, s]) => s).join(" ")}`, SRC);
    for (const n of ["Jenna Cho", "Linda Park", "Rosa Diaz", "Samuel Reed"]) expect(c.professionals).toContain(n);
  }, 120_000);
});

describe("field checks against adversarial model output", () => {
  const T =
    `${BASE} Linda Park, the nurse navigator, handles their referrals on Tuesday mornings. ` +
    "They see a lot of adults in cancer treatment and families in hospice. " +
    "She said I should meet John Smith, the volunteer coordinator at Hope House. " +
    "They need a therapist with evening hours who takes Medicaid. " +
    "I will send my flyer next week.";
  const empty = {
    refers_via: null, referral_contact: null, populations: [], needs_from_therapist: null, waitlist: null, payer_mix: null, best_time: null,
    last_meeting_summary: null, connection_points: null, who_else: [], follow_up_points: [],
  };
  const REFUSED: [string, Record<string, unknown>][] = [
    ["who_else survivor", { who_else: [{ name: "John Smith", role: "cancer survivor and volunteer", organization: "Hope House" }] }],
    ["who_else boy with autism", { who_else: [{ name: null, role: "the boy with autism", organization: "Hope House" }] }],
    ["who_else hospice resident", { who_else: [{ name: null, role: "hospice resident", organization: "Hope House" }] }],
    ["who_else Linda in treatment", { who_else: [{ name: "Linda Park", role: "nurse in cancer treatment", organization: null }] }],
    ["who_else widow", { who_else: [{ name: null, role: "widow volunteer", organization: "Hope House" }] }],
    ["who_else Dr. stranger", { who_else: [{ name: "Dr. Smith", role: "volunteer coordinator", organization: "Hope House" }] }],
    ["who_else org smuggle", { who_else: [{ name: "John Smith", role: "volunteer coordinator", organization: "Hope House, in cancer treatment" }] }],
    ["summary staff in treatment", { last_meeting_summary: "They send referrals by fax. Linda Park, the nurse navigator, is in cancer treatment." }],
    ["summary staff hospice", { last_meeting_summary: "They send referrals by fax. Linda Park is in hospice on Tuesday mornings." }],
    ["contact in hospice", { referral_contact: "John Smith at Hope House hospice" }],
    ["needs recombined", { needs_from_therapist: "Linda Park needs a therapist with evening hours" }],
    ["population one person", { populations: ["Linda Park in cancer treatment"] }],
    ["follow-up in hospice", { follow_up_points: ["Check on John Smith in hospice"] }],
    ["best time with Linda", { best_time: "Tuesday mornings when Linda Park is not in treatment" }],
    ["connection smuggle", { connection_points: "Linda Park and I both have family in hospice" }],
  ];
  it.each(REFUSED)("refuses %s", async (_id, stub) => {
    const { cleanTranscript, checkFields, debriefAllowlist } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(T, SRC);
    const allow = await debriefAllowlist(SRC, c.professionals);
    const r = await checkFields({ ...empty, ...stub } as never, c.text, allow, { professionals: c.professionals, sourceId: "x" });
    for (const k of Object.keys(stub)) {
      const v = (r.fields as Record<string, unknown>)[k];
      expect(Array.isArray(v) ? v.length : v).toBeFalsy();
    }
    expect(r.rejected.length).toBeGreaterThan(0);
  }, 120_000);

  it("keeps the legitimate fields", async () => {
    const { cleanTranscript, checkFields, debriefAllowlist } = await import("../lib/referrals/debrief");
    const c = await cleanTranscript(T, SRC);
    const allow = await debriefAllowlist(SRC, c.professionals);
    const r = await checkFields(
      {
        ...empty,
        refers_via: "fax",
        referral_contact: "Linda Park, the nurse navigator",
        populations: ["adults in cancer treatment", "families in hospice"],
        needs_from_therapist: "A therapist with evening hours who takes Medicaid",
        best_time: "Tuesday mornings",
        follow_up_points: ["Send my flyer next week"],
        who_else: [{ name: "John Smith", role: "volunteer coordinator", organization: "Hope House" }],
      } as never,
      c.text,
      allow,
      { professionals: c.professionals, sourceId: "x" },
    );
    expect(r.fields).toMatchObject({
      refers_via: "fax",
      referral_contact: "Linda Park, the nurse navigator",
      populations: ["adults in cancer treatment", "families in hospice"],
      needs_from_therapist: "A therapist with evening hours who takes Medicaid",
      best_time: "Tuesday mornings",
      follow_up_points: ["Send my flyer next week"],
    });
    expect(r.fields.who_else.map((w) => w.name)).toEqual(["John Smith"]);
  }, 120_000);
});

describe("crafted WAV headers", () => {
  const fmt = (rate: number, ch: number, bits: number) => {
    const b = Buffer.alloc(24);
    b.write("fmt ", 0, "ascii"); b.writeUInt32LE(16, 4); b.writeUInt16LE(1, 8); b.writeUInt16LE(ch, 10); b.writeUInt32LE(rate, 12);
    b.writeUInt32LE((rate * ch * bits) / 8, 16); b.writeUInt16LE((ch * bits) / 8, 20); b.writeUInt16LE(bits, 22);
    return b;
  };
  const build = (chunks: Buffer[], dataLen: number, sizeField?: number) => {
    const d = Buffer.alloc(8 + dataLen); d.write("data", 0, "ascii"); d.writeUInt32LE(sizeField ?? dataLen, 4);
    const body = Buffer.concat([Buffer.from("WAVE"), ...chunks, d]);
    const h = Buffer.alloc(8); h.write("RIFF", 0, "ascii"); h.writeUInt32LE(body.length, 4);
    return Buffer.concat([h, body]);
  };
  const n = 8000 * 2 * 400; // 400 s of 8 kHz mono 16-bit (6.4 MB)
  it("refuses two fmt chunks, two data chunks, and a data size field that lies", async () => {
    const { checkRecording, wavSeconds } = await import("../lib/referrals/debrief");
    expect(() => checkRecording(build([fmt(8000, 1, 16), fmt(192000, 2, 32)], n))).toThrow();
    const d1 = Buffer.alloc(8 + 16000); d1.write("data", 0, "ascii"); d1.writeUInt32LE(16000, 4);
    expect(() => checkRecording(build([fmt(8000, 1, 16), d1], n))).toThrow();
    const lying = build([fmt(8000, 1, 16)], n, 16000);
    expect(wavSeconds(lying)).toBeCloseTo(400, 0);
    expect(() => checkRecording(lying)).toThrow(/over 3 minutes/);
    const ext = Buffer.concat([fmt(8000, 1, 16), Buffer.alloc(2)]); ext.writeUInt32LE(18, 4);
    expect(() => checkRecording(build([ext], n))).toThrow(/over 3 minutes/);
    const list = Buffer.alloc(12); list.write("LIST", 0, "ascii"); list.writeUInt32LE(3, 4);
    expect(() => checkRecording(build([fmt(8000, 1, 16), list], n))).toThrow(/over 3 minutes/);
    expect(checkRecording(build([fmt(8000, 1, 16), list], 8000 * 2 * 10))).toBeCloseTo(10, 0);
  });
});

describe("saving: forged seals and edits never store a person", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { forgetAllowlist, practiceAllowlist } = await import("../lib/aeon/guard");
  const { analyzeDebrief, saveDebrief } = await import("../lib/referrals/debrief");
  const sql = db();
  const ID = "00000000-0000-4000-8000-0000000009b1";
  const ID2 = "00000000-0000-4000-8000-0000000009b2";
  const cleanup = async () => {
    await sql`delete from practice_os.approvals where payload ->> 'referral_source_id' in (${ID}, ${ID2})`;
    await sql`delete from practice_os.memories where source = 'referral_debrief'`;
    await sql`delete from practice_os.referral_sources where suggested_from in (${ID}, ${ID2})`;
    await sql`delete from practice_os.referral_sources where id in (${ID}, ${ID2})`;
  };
  beforeAll(async () => {
    await cleanup();
    await sql`insert into practice_os.referral_sources (id, name, organization, specialty, npi_type, credential, city, state, stage, is_sample)
      values (${ID}, 'Amara Okafor, MD', 'Northside Women''s Health', 'OB/GYN', 'individual', 'MD', 'Chicago', 'IL', 'contacted', true),
             (${ID2}, 'Greta Holm, LCSW', 'Holm Family Services', 'Social work', 'individual', 'LCSW', 'Chicago', 'IL', 'contacted', true)`;
    forgetAllowlist();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it("refuses every forged or smuggled save and stores only what plain code passed", async () => {
    const T = `${BASE} Linda Park, the nurse navigator, handles their referrals on Tuesday mornings. She said I should meet John Smith, the volunteer coordinator at Hope House.`;
    const chat = (async (feature: string) => {
      const message =
        feature === "referral_debrief"
          ? {
              role: "assistant",
              content: null,
              tool_calls: [{ id: "c", type: "function", function: { name: "record_debrief", arguments: JSON.stringify({ refers_via: "fax", referral_contact: "Linda Park, the nurse navigator", populations: [], who_else: [{ name: "John Smith", role: "volunteer coordinator", organization: "Hope House" }], follow_up_points: [] }) } }],
            }
          : { role: "assistant", content: "{}" };
      return { choices: [{ index: 0, message }] };
    }) as never;
    const r = await analyzeDebrief(ID, { transcript: T }, { chat });
    if (r.status !== "ready") throw new Error(r.status);
    const d = r.draft;
    const f = d.fields;
    expect(d.professionals.names).toEqual(expect.arrayContaining(["Linda Park", "John Smith"]));
    const refused = async (srcId: string, body: unknown) => expect(saveDebrief(srcId, body)).rejects.toThrow();
    await refused(ID2, { fields: { ...f, who_else: [], referral_contact: "Linda Park" }, professionals: d.professionals, remember: false });
    await refused(ID2, { fields: { ...f, who_else: f.who_else.map((w) => ({ ...w, add: true })) }, professionals: d.professionals, remember: false });
    await refused(ID, { fields: { ...f, who_else: [] }, professionals: { names: [...d.professionals.names, "Kevin Ortiz"], token: d.professionals.token }, remember: false });
    await refused(ID, { fields: { ...f, who_else: [], referral_contact: "Dr. Maria Lopez" }, professionals: d.professionals, remember: false });
    await refused(ID, { fields: { ...f, who_else: [], last_meeting_summary: "Coffee went well. maria lopez says hi." }, professionals: d.professionals, remember: false });
    await refused(ID, { fields: { ...f, who_else: f.who_else.map((w) => ({ ...w, role: "cancer survivor", add: true })) }, professionals: d.professionals, remember: false });
    await refused(ID, { fields: { ...f, who_else: [], last_meeting_summary: "Linda Park, the nurse navigator, is out on leave for chemo." }, professionals: d.professionals, remember: false });
    await refused(ID, { fields: { ...f, who_else: [], needs_from_therapist: "Someone to see the man in room 412" }, professionals: d.professionals, remember: false });
    // An unticked new name is ignored, never stored.
    await saveDebrief(ID, { fields: { ...f, who_else: [{ name: "Kevin Ortiz", role: "nurse", organization: null, add: false }] }, professionals: d.professionals, remember: false });
    // The real save, with John Smith ticked.
    await saveDebrief(ID, { fields: { ...f, who_else: f.who_else.map((w) => ({ ...w, add: true })) }, professionals: d.professionals, remember: true });
    const dump = JSON.stringify(await sql`select * from practice_os.referral_sources where id in (${ID}, ${ID2}) or suggested_from in (${ID}, ${ID2})`);
    for (const w of ["Kevin", "Maria", "chemo", "412", "survivor"]) expect(dump).not.toContain(w);
    expect(dump).toContain("John Smith");
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from practice_os.referral_sources where suggested_from is not null and suggestion_confirmed_at is null`;
    expect(n).toBe(0);
    forgetAllowlist();
    const allow = JSON.stringify(await practiceAllowlist());
    expect(allow).toContain("John Smith");
    expect(allow).not.toContain("Kevin");
  }, 300_000);
});
