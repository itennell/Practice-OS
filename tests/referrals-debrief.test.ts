// "Debrief my coffee meeting" (lib/referrals/debrief.ts): the 3-minute cap, the
// privacy pass on what partners say about their own patients, the crisis stop,
// the referral-fee refusal, the field checks against the transcript, suggested
// cards, and audio that never touches the disk. No live model or transcription:
// Muse and the transcriber are fixtures.
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Every disk write in this file goes through these spies, so the audio test can prove there were none.
const writes = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("node:fs/promises", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs/promises")>();
  const spy =
    (name: string, fn: (...a: never[]) => unknown) =>
    (...args: never[]) => {
      writes.calls.push(`${name}:${String(args[0])}`);
      return fn(...args);
    };
  return { ...real, default: { ...real, writeFile: spy("writeFile", real.writeFile as never) }, writeFile: spy("writeFile", real.writeFile as never) };
});

import { loadEnv } from "../lib/env";
import { aboutAPatient, checkRecording, genericGroup, hasInitials, keyTerms, MAX_DEBRIEF_SECONDS, namedAsPatient, numbersSupported, professionalNames, support, wavSeconds } from "../lib/referrals/debrief";
import { memoryFactsFor, shortName } from "../lib/referrals/debrief-shape";
import { STANDIN_TRANSCRIPT } from "../lib/referrals/debrief-standin";
import {
  CRISIS_TRANSCRIPT,
  FEE_TRANSCRIPT,
  FOLLOW_UP_LETTER,
  LEAKY_FIELDS,
  PATIENT_WORDS,
  PHI_TRANSCRIPT,
  PROBE_FIELDS,
  PROBE_TRANSCRIPT,
  PROBE_WORDS,
  PROBES,
  STAFF,
  STAFF_LINES,
} from "./fixtures/referrals/debrief";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

/** A mono 16-bit PCM WAV of silence. */
function wav(seconds: number, rate = 24_000): Buffer {
  const samples = Math.round(seconds * rate);
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0, "ascii");
  b.writeUInt32LE(b.length - 8, 4);
  b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii");
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36, "ascii");
  b.writeUInt32LE(samples * 2, 40);
  return b;
}

describe("the recording", () => {
  it("reads the length from the WAV header", () => {
    expect(wavSeconds(wav(2))).toBeCloseTo(2, 3);
    expect(wavSeconds(Buffer.from("not a wav at all, just some bytes here......"))).toBeNull();
  });
  it("refuses anything over 3 minutes on the server, even when it is small", () => {
    expect(checkRecording(wav(MAX_DEBRIEF_SECONDS))).toBeCloseTo(180, 0);
    expect(() => checkRecording(wav(181))).toThrow(/over 3 minutes/);
    // A low sample rate keeps 4 minutes under the byte cap; the header still gives it away.
    expect(() => checkRecording(wav(240, 8_000))).toThrow(/over 3 minutes/);
    expect(() => checkRecording(Buffer.alloc(0))).toThrow(/No recording/);
  });
  it("a crafted header can't shrink the length: the rate comes from the format, not the byte-rate field", () => {
    const crafted = wav(200, 8_000);
    crafted.writeUInt32LE(8_000 * 2 * 10, 28); // claims ten times the real byte rate (20 s)
    expect(wavSeconds(crafted)).toBeCloseTo(200, 0);
    expect(() => checkRecording(crafted)).toThrow(/over 3 minutes/);
    const stereo = wav(100, 8_000);
    stereo.writeUInt16LE(2, 22); // two channels: half the length
    expect(wavSeconds(stereo)).toBeCloseTo(50, 0);
    const float = wav(2);
    float.writeUInt16LE(3, 20); // not PCM
    expect(() => checkRecording(float)).toThrow(/WAV/);
    const silly = wav(2);
    silly.writeUInt16LE(0, 34); // zero bits per sample
    expect(wavSeconds(silly)).toBeNull();
  });
  it("the route refuses a recording over 3 minutes before anything runs", async () => {
    const { POST } = await import("../app/api/referrals/[id]/debrief/route");
    const form = new FormData();
    form.append("audio", new Blob([new Uint8Array(wav(200, 8_000))]), "debrief.wav");
    const res = await POST(
      new Request("http://localhost:3000/api/referrals/00000000-0000-4000-8000-0000000009a1/debrief", {
        method: "POST",
        body: form,
        headers: { host: "localhost:3000", "sec-fetch-site": "same-origin" },
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-0000000009a1" }) } as never,
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as { error: string }).error).toMatch(/over 3 minutes/);
  });
});

describe("plain-code checks", () => {
  it("leaves out sentences about one of the partner's patients", () => {
    expect(aboutAPatient("Dr. Okafor told me about one of her patients, Maria Lopez, a 34-year-old who was just diagnosed.")).toBe(true);
    expect(aboutAPatient("Her patient Kevin Ortiz has bipolar disorder and needs a therapist soon.")).toBe(true);
    expect(aboutAPatient("There's a woman going through chemo who needs someone.")).toBe(true);
    expect(aboutAPatient("They send referrals by fax, and the front desk coordinator handles them.")).toBe(false);
    expect(aboutAPatient("They mostly see women going through cancer treatment and new parents.")).toBe(false);
  });
  it("a field is supported only when its key words and numbers are in the debrief", () => {
    expect(keyTerms("referrals by fax")).toEqual(["refer"]);
    expect(support("Tuesday mornings", PHI_TRANSCRIPT)).toBe(1);
    expect(support("We both love hiking in Colorado", PHI_TRANSCRIPT)).toBeLessThan(0.6);
    expect(numbersSupported("About 40% Medicaid", PHI_TRANSCRIPT)).toBe(false);
  });
  it("memory facts are written by plain code from her confirmed fields", () => {
    expect(shortName("Amara Okafor, MD")).toBe("Dr. Okafor");
    expect(memoryFactsFor("Dr. Okafor", { refers_via: "fax", referral_contact: "oncology nurse navigator", best_time: "Tuesday mornings" })).toEqual([
      "Dr. Okafor's office takes referrals by fax; ask for the oncology nurse navigator.",
      "Best time to reach Dr. Okafor's office: Tuesday mornings.",
    ]);
  });
  it("every probe about one person is left out; staff with an appositive role or title still pass", () => {
    for (const p of PROBES) expect(aboutAPatient(p) || namedAsPatient(p, "Kevin Ortiz")).toBe(true);
    for (const s of STAFF_LINES) expect(aboutAPatient(s)).toBe(false);
    expect(professionalNames(STAFF_LINES.join(" "), STAFF)).toEqual(STAFF);
    // Words after a name never make it a professional.
    expect(professionalNames("Kevin Ortiz needs a therapist soon, she said.", ["Kevin Ortiz"])).toEqual([]);
    expect(professionalNames("Tom Becker, our receptionist's patient, needs help.", ["Tom Becker"])).toEqual([]);
    expect(professionalNames("Dr. Sam Patel runs the clinic.", ["Sam Patel"])).toEqual(["Sam Patel"]);
    // A professional as the subject of a patient verb is dropped too: default refuse.
    expect(professionalNames("Dr. Sam Patel sees adults.", ["Sam Patel"])).toEqual([]);
    expect(professionalNames("Sam Patel, MD handles referrals.", ["Sam Patel"])).toEqual(["Sam Patel"]);
    expect(hasInitials("J.R. keeps missing appointments")).toBe(true);
    expect(hasInitials("J R keeps missing appointments")).toBe(true);
    expect(hasInitials("JR keeps missing appointments")).toBe(true);
    expect(hasInitials("The RN and the NP at the OB office")).toBe(false);
    expect(professionalNames("J.R. is great.", ["J.R."])).toEqual([]);
    expect(genericGroup("adults with cancer")).toBe(true);
    expect(genericGroup("families in hospice")).toBe(true);
    expect(genericGroup("A new parent with severe postpartum psychosis")).toBe(false);
  });
  it("the e2e stand-in transcript has a patient story for the privacy pass to take out", () => {
    expect(STANDIN_TRANSCRIPT).toMatch(/Maria Lopez/);
  });
});

describe.skipIf(!hasDb)("the debrief against the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { forgetAllowlist } = await import("../lib/aeon/guard");
  const { analyzeDebrief, saveDebrief } = await import("../lib/referrals/debrief");
  const sql = db();
  const ID = "00000000-0000-4000-8000-0000000009a1";
  const NAME = "Amara Okafor, MD";

  type Sent = { feature: string; text: string };
  const sent: Sent[] = [];
  /** Muse stand-in: the profile tool call with `fields`, then a follow-up letter. Records everything it was sent. */
  const fakeChat = (fields: unknown, letter = FOLLOW_UP_LETTER) =>
    (async (feature: string, params: { messages: { content?: unknown }[] }) => {
      sent.push({ feature, text: JSON.stringify(params.messages) });
      const message =
        feature === "referral_debrief"
          ? { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "record_debrief", arguments: JSON.stringify(fields) } }] }
          : { role: "assistant", content: JSON.stringify({ subject: "Thank you for coffee", letter }) };
      return { choices: [{ index: 0, message }] };
    }) as never;

  async function counts() {
    const [r] = await sql<{ cards: number; contacts: number; memories: number; approvals: number }[]>`
      select (select count(*)::int from practice_os.referral_sources) as cards,
             (select count(*)::int from practice_os.referral_contacts where source_id = ${ID}) as contacts,
             (select count(*)::int from practice_os.memories) as memories,
             (select count(*)::int from practice_os.approvals) as approvals`;
    return r;
  }

  async function cleanup() {
    await sql`delete from practice_os.approvals where payload ->> 'referral_source_id' = ${ID}`;
    await sql`delete from practice_os.memories where source = 'referral_debrief'`;
    await sql`delete from practice_os.referral_sources where suggested_from = ${ID}`;
    await sql`delete from practice_os.referral_sources where id = ${ID}`;
  }

  beforeAll(async () => {
    await cleanup();
    await sql`
      insert into practice_os.referral_sources (id, name, organization, specialty, npi_type, credential, city, state, stage, is_sample)
      values (${ID}, ${NAME}, 'Northside Women''s Health', 'OB/GYN', 'individual', 'MD', 'Chicago', 'IL', 'contacted', true)`;
    forgetAllowlist();
  });
  afterAll(async () => {
    await cleanup();
    await closeDb();
  });

  it("a partner's patient story is never stored anywhere and never reaches Muse", async () => {
    const since = new Date();
    const r = await analyzeDebrief(ID, { transcript: PHI_TRANSCRIPT }, { chat: fakeChat(LEAKY_FIELDS) });
    expect(r.status).toBe("ready");
    if (r.status !== "ready") return;
    const d = r.draft;
    // Muse saw only the cleaned text.
    for (const w of PATIENT_WORDS) for (const s of sent) expect(s.text).not.toContain(w);
    expect(d.withheld).toBeGreaterThanOrEqual(2);
    // What it sent back about the patient was dropped by the checks.
    const draftText = JSON.stringify(d);
    for (const w of PATIENT_WORDS) expect(draftText).not.toContain(w);
    expect(d.fields.refers_via).toBe("fax");
    expect(d.fields.populations).toEqual(["women going through cancer treatment", "new parents"]);

    // She confirms the draft as it is.
    // She ticks Jenna Cho as a referral contact.
    const saved = await saveDebrief(ID, {
      fields: { ...d.fields, who_else: d.fields.who_else.map((w) => ({ ...w, add: true })) },
      follow_up: d.follow_up,
      remember: true,
      professionals: d.professionals,
    });
    expect(saved.follow_up_approval).toBeTruthy();
    const everything = JSON.stringify([
      await sql`select * from practice_os.referral_sources where id = ${ID} or suggested_from = ${ID}`,
      await sql`select * from practice_os.referral_contacts where source_id = ${ID}`,
      await sql`select * from practice_os.memories where source = 'referral_debrief'`,
      await sql`select * from practice_os.approvals where payload ->> 'referral_source_id' = ${ID}`,
      await sql`select * from practice_os.audit_log where at >= ${since}`,
      await sql`select * from practice_os.model_calls where at >= ${since}`,
    ]);
    for (const w of PATIENT_WORDS) expect(everything).not.toContain(w);
    // The transcript itself is stored nowhere.
    expect(everything).not.toContain("one of her patients");
  }, 120_000);

  it("saves the profile, a 'met' entry, memories and suggested cards introduced by this partner", async () => {
    const [card] = await sql<{ refers_via: string; referral_contact: string; best_time: string; stage: string; profile_updated_at: Date | null }[]>`
      select refers_via, referral_contact, best_time, stage, profile_updated_at from practice_os.referral_sources where id = ${ID}`;
    expect(card).toMatchObject({ refers_via: "fax", referral_contact: "front desk coordinator", best_time: "Tuesday mornings", stage: "connected" });
    expect(card.profile_updated_at).toBeTruthy();
    const [met] = await sql<{ kind: string; note: string }[]>`select kind, note from practice_os.referral_contacts where source_id = ${ID}`;
    expect(met.kind).toBe("met");
    const memories = await sql<{ text: string }[]>`select text from practice_os.memories where source = 'referral_debrief'`;
    expect(memories.length).toBeGreaterThanOrEqual(1);
    expect(memories.length).toBeLessThanOrEqual(3);
    expect(memories.map((m) => m.text)).toContain("Dr. Okafor's office takes referrals by fax; ask for the front desk coordinator.");
    const suggested = await sql<{ name: string; introduced_by: string; stage: string; notes: string; npi: string | null }[]>`
      select name, introduced_by, stage, notes, npi from practice_os.referral_sources where suggested_from = ${ID}`;
    // Jenna Cho was named in the debrief; Sam Patel was not, and the "patient" entry never passes.
    expect(suggested).toEqual([{ name: "[Sample] Jenna Cho", introduced_by: "Dr. Okafor", stage: "found", notes: "Suggested from your debrief", npi: null }]);
    // Nothing contacted them: no letter to a suggested card.
    const [{ letters }] = await sql<{ letters: number }[]>`
      select count(*)::int as letters from practice_os.approvals a join practice_os.referral_sources s on s.id::text = a.payload ->> 'referral_source_id'
       where s.suggested_from = ${ID}`;
    expect(letters).toBe(0);
  });

  it("fields she never said are rejected, with the reason", async () => {
    const r = await analyzeDebrief(ID, { transcript: PHI_TRANSCRIPT }, { chat: fakeChat(LEAKY_FIELDS) });
    if (r.status !== "ready") throw new Error(r.status);
    const fields = r.draft.fields;
    expect(fields.payer_mix).toBeNull();
    expect(fields.connection_points).toBeNull();
    expect(fields.who_else.map((w) => w.name)).toEqual(["Jenna Cho"]);
    expect(r.draft.rejected).toEqual(
      expect.arrayContaining([
        { field: "Insurance and private pay", why: "it has a number you didn't say" },
        { field: "What you have in common", why: "you didn't say that in the debrief" },
      ]),
    );
  }, 120_000);

  it("a crisis in the transcript stops everything: the fixed reply, no model call, nothing saved", async () => {
    const before = await counts();
    sent.length = 0;
    const r = await analyzeDebrief(ID, { transcript: CRISIS_TRANSCRIPT }, { chat: fakeChat(LEAKY_FIELDS) });
    expect(r.status).toBe("crisis");
    if (r.status === "crisis") expect(r.reply).toMatch(/988/);
    expect(sent).toEqual([]);
    expect(await counts()).toEqual(before);
  });

  it("referral-fee talk refuses the follow-up", async () => {
    sent.length = 0;
    const r = await analyzeDebrief(ID, { transcript: FEE_TRANSCRIPT }, { chat: fakeChat({ ...LEAKY_FIELDS, needs_from_therapist: "Pay a referral fee of $50 for each new client" }) });
    if (r.status !== "ready") throw new Error(r.status);
    expect(r.draft.follow_up).toBeNull();
    expect(r.draft.follow_up_note).toMatch(/never offers or accepts anything for a referral/);
    expect(r.draft.fields.needs_from_therapist).toBeNull();
    expect(sent.map((s) => s.feature)).toEqual(["referral_debrief"]);
    // And an edited field with fee language is refused at save.
    await expect(saveDebrief(ID, { fields: { ...r.draft.fields, needs_from_therapist: "We pay a referral fee for each client" } })).rejects.toThrow(/Nothing of value/);
  }, 120_000);

  it("probes: nothing about one person reaches Muse, the card, the log, memory, approvals or the allowlist", async () => {
    const { cleanTranscript } = await import("../lib/referrals/debrief");
    const { practiceAllowlist } = await import("../lib/aeon/guard");
    const source = { name: NAME, organization: "Northside Women's Health" };
    const cleaned = await cleanTranscript(PROBE_TRANSCRIPT, source);
    for (const w of PROBE_WORDS) expect(cleaned.text).not.toContain(w);
    for (const s of STAFF) expect(cleaned.professionals).toContain(s);
    expect(cleaned.professionals).not.toContain("Kevin Ortiz");
    expect(cleaned.professionals).not.toContain("Tom Becker");

    sent.length = 0;
    const r = await analyzeDebrief(ID, { transcript: PROBE_TRANSCRIPT }, { chat: fakeChat(PROBE_FIELDS) });
    if (r.status !== "ready") throw new Error(r.status);
    for (const w of PROBE_WORDS) for (const s of sent) expect(s.text).not.toContain(w);
    const f = r.draft.fields;
    expect(f.referral_contact).toBeNull();
    expect(f.needs_from_therapist).toBeNull();
    expect(f.best_time).toBeNull();
    expect(f.last_meeting_summary).toBeNull();
    expect(f.populations).toBeNull();
    expect(f.follow_up_points).toEqual([]);
    expect(f.who_else.map((w) => w.name)).toEqual(["Linda Park"]);

    // A forged person, or a forged seal of names, is refused at save.
    await expect(
      saveDebrief(ID, { fields: { ...f, who_else: [{ name: "Kevin Ortiz", role: "nurse", organization: null, add: true, token: "forged" }] }, professionals: r.draft.professionals }),
    ).rejects.toThrow(/changed after Aeon checked/);
    await expect(
      saveDebrief(ID, { fields: { ...f, referral_contact: "Kevin Ortiz" }, professionals: { names: ["Kevin Ortiz"], token: r.draft.professionals.token } }),
    ).rejects.toThrow();
    // Edited fields carrying the probes are refused too.
    for (const p of PROBES) {
      await expect(saveDebrief(ID, { fields: { ...f, last_meeting_summary: `${p} They refer by fax.` }, professionals: r.draft.professionals })).rejects.toThrow();
    }
    // An unticked person never becomes a card; she saves without ticking Linda Park.
    await saveDebrief(ID, { fields: f, professionals: r.draft.professionals, remember: true });
    const everything = JSON.stringify([
      await sql`select * from practice_os.referral_sources where id = ${ID} or suggested_from = ${ID}`,
      await sql`select * from practice_os.referral_contacts where source_id = ${ID}`,
      await sql`select * from practice_os.memories where source = 'referral_debrief'`,
      await sql`select * from practice_os.approvals where payload ->> 'referral_source_id' = ${ID}`,
    ]);
    for (const w of PROBE_WORDS) expect(everything).not.toContain(w);
    expect(everything).not.toContain("Linda Park");
    forgetAllowlist();
    const allow = JSON.stringify(await practiceAllowlist());
    for (const w of ["Kevin", "Ortiz", "Becker", "J.R", "Linda Park"]) expect(allow).not.toContain(w);
  }, 120_000);

  it("the database refuses a suggested card she never confirmed", async () => {
    await expect(sql`insert into practice_os.referral_sources (name, stage, suggested_from) values ('Unconfirmed Person', 'found', ${ID})`).rejects.toThrow(/suggestion_confirmed/);
  });

  it("the chat's debrief_meeting finds the card and hands back a card that opens its recorder", async () => {
    const { TOOLS_BY_NAME } = await import("../lib/aeon/tools");
    const tool = TOOLS_BY_NAME.get("debrief_meeting")!;
    expect(tool.changesData).toBe(true);
    const r = await (tool.run as unknown as (i: unknown, c: unknown) => Promise<{ structuredContent?: { documents?: { open: string; kind: string }[] } }>)(
      { partner: "Amara Okafor" },
      { by: "test" },
    );
    expect(r.structuredContent?.documents?.[0]).toMatchObject({ kind: "referral_debrief", open: `/referrals?debrief=${ID}` });
  });

  it("the audio goes from memory to the transcriber and is never written to disk", async () => {
    const tmpBefore = readdirSync(tmpdir()).filter((f) => /dictation|debrief/i.test(f));
    const oldKey = process.env.MODEL_API_KEY;
    process.env.MODEL_API_KEY = "test-key-not-real";
    const posted: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        posted.push(String(url));
        return new Response(JSON.stringify({ transcript: "Coffee with Dr. Okafor. They send referrals by fax, and the front desk coordinator handles them." }), { status: 200 });
      }),
    );
    writes.calls.length = 0;
    const audio = wav(3);
    try {
      const r = await analyzeDebrief(ID, { audio }, { chat: fakeChat({ refers_via: "fax", populations: [], who_else: [], follow_up_points: [] }) });
      expect(r.status).toBe("ready");
    } finally {
      vi.unstubAllGlobals();
      if (oldKey === undefined) delete process.env.MODEL_API_KEY;
      else process.env.MODEL_API_KEY = oldKey;
    }
    expect(posted[0]).toMatch(/\/asr\/transcribe$/);
    expect(writes.calls).toEqual([]);
    expect(readdirSync(tmpdir()).filter((f) => /dictation|debrief/i.test(f))).toEqual(tmpBefore);
    // The request's copy of the audio is wiped once it is transcribed.
    expect(audio.subarray(44).every((b) => b === 0)).toBe(true);
    expect(audio.subarray(0, 4).every((b) => b === 0)).toBe(true);
  }, 120_000);
});
