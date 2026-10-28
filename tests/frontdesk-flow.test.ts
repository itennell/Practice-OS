// The Front Desk flow end to end with fake phone and calendar adapters:
// voicemail -> crisis check -> extraction -> three times -> "2" books it.
// It writes inquiries, approvals and bookings, and flips the Front Desk
// switches, so it runs only on a local throwaway database (localhost).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

vi.mock("../lib/frontdesk/extract", async (orig) => {
  const real = await orig<typeof import("../lib/frontdesk/extract")>();
  return {
    ...real,
    // Stands in for muse-spark-1.3: a name if "it's <Name>" is said, intent from keywords.
    extractVoicemail: vi.fn(async (text: string, callerId: string | null) => {
      const name = /it's (\w+)/i.exec(text)?.[1] ?? null;
      const intent = /appointment|consult|book/i.test(text) ? "book" : /insurance|fee|cost/i.test(text) ? "question" : "other";
      return real.vetExtraction({ name, callback_number: null, intent, summary: "Wants a first consult" }, callerId);
    }),
  };
});

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { processText, processVoicemail } = await import("../lib/frontdesk/ingest");
const { queueReminders } = await import("../lib/frontdesk/reminders");
const { checkFrontDesk } = await import("../lib/frontdesk/check");
const { offerTimes } = await import("../lib/frontdesk/offers");
const { extractVoicemail } = await import("../lib/frontdesk/extract");
const { CRISIS_REPLY } = await import("../lib/safety");

const SAM = "+13125550144";
const RILEY = "+13125550145";
const ALEX = "+13125550146";
const CLINICIAN = "+13125550199";
const PHONES = [SAM, RILEY, ALEX];

const sent: Array<{ to: string; body: string }> = [];
const booked: string[] = [];
let free = true;
const NOW = new Date("2026-11-02T16:00:00Z"); // Mon 10:00 am Chicago
const slot = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 15 * 60_000) });
const SLOTS = [slot("2026-11-03T16:00:00Z"), slot("2026-11-04T20:00:00Z"), slot("2026-11-05T22:00:00Z")];

const phone = {
  vendor: "twilio" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  listVoicemails: async () => [],
  listInboundTexts: async () => [],
  sendText: async (to: string, body: string) => {
    sent.push({ to, body });
    return { id: `SM_test_${sent.length}_${Date.now()}` };
  },
};
const calendar = {
  provider: "calcom" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  openSlots: async () => SLOTS,
  isFree: async () => free,
  book: async (_s: unknown, reference: string) => {
    booked.push(reference);
    return { externalId: `bk_test_${reference}` };
  },
  reschedule: async (id: string) => ({ externalId: id }),
  cancel: async () => {},
};

let n = 0;
const vm = (from: string, transcript: string) => ({
  id: `RE_test_${++n}_${Date.now()}`,
  from,
  receivedAt: NOW,
  audio: async () => ({ bytes: Buffer.from("not a wav"), mime: "audio/mpeg" }), // skips Muse: provider transcript is used
  providerTranscript: transcript,
});
const text = (from: string, body: string) => ({ id: `SM_in_${++n}_${Date.now()}`, from, body, receivedAt: NOW });

let savedRules: unknown;
const savedEnv = { DRY_RUN: process.env.DRY_RUN, CLINICIAN_ALERT_PHONE: process.env.CLINICIAN_ALERT_PHONE };

async function cleanup() {
  await db()`delete from practice_os.approvals where payload ->> 'to' in ${db()(PHONES)} or payload ->> 'inquiry_id' in (
    select id::text from practice_os.inquiries where contact_phone in ${db()(PHONES)})`;
  await db()`delete from practice_os.consult_bookings where contact_phone in ${db()(PHONES)}`;
  await db()`delete from practice_os.alerts where inquiry_id in (select id from practice_os.inquiries where contact_phone in ${db()(PHONES)})`;
  await db()`delete from practice_os.inquiries where contact_phone in ${db()(PHONES)}`;
  await db()`delete from practice_os.sms_opt_outs where phone in ${db()(PHONES)}`;
}

beforeAll(async () => {
  if (!localDb) return;
  process.env.DRY_RUN = "false"; // safe: every adapter here is a fake
  process.env.CLINICIAN_ALERT_PHONE = CLINICIAN;
  [{ front_desk_rules: savedRules }] = await db()`select front_desk_rules from practice_os.settings limit 1`;
  await db()`update practice_os.settings set front_desk_rules = ${db().json({ text_missed_callers: true, book_by_text: true, send_reminders: true } as never)}, timezone = 'America/Chicago'`;
  setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => NOW });
  await cleanup();
});

afterAll(async () => {
  if (!localDb) return;
  setFrontDeskDeps(null);
  await cleanup();
  await db()`update practice_os.settings set front_desk_rules = ${db().json(savedRules as never)}`;
  process.env.DRY_RUN = savedEnv.DRY_RUN;
  process.env.CLINICIAN_ALERT_PHONE = savedEnv.CLINICIAN_ALERT_PHONE;
  await closeDb();
});

beforeEach(() => {
  sent.length = 0;
  free = true;
});

const inquiryOf = async (p: string) => (await db()`select * from practice_os.inquiries where contact_phone = ${p} order by created_at desc limit 1`)[0];
const approvalsFor = async (inquiryId: string) =>
  db()`select kind, status, decided_by, error from practice_os.approvals where payload ->> 'inquiry_id' = ${inquiryId} order by created_at`;

describe.skipIf(!localDb)("Front Desk flow (local database only)", () => {
  it("a voicemail from Sam becomes an inquiry and a three-times text, sent on her rule", async () => {
    expect(await processVoicemail(vm(SAM, "Hi, it's Sam, I'd like to set up a first appointment."), phone)).toBe("done");
    const inq = await inquiryOf(SAM);
    expect(inq).toMatchObject({ channel: "voicemail", contact_name: "Sam", status: "options_sent", crisis_flag: false });
    expect(inq.ai_disclosed_at).not.toBeNull();
    expect(await approvalsFor(inq.id)).toEqual([{ kind: "text_consult_options", status: "done", decided_by: "auto:front_desk", error: null }]);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(SAM);
    expect(sent[0].body).toBe("Hi Sam, this is the AI assistant for Reyes Counseling. Open consult times: 1) Tue 10am 2) Wed 2pm 3) Thu 4pm. Reply 1, 2 or 3 to book. Reply STOP to opt out.");
  });

  it("Sam replies 2: the time is re-checked, booked by reference only, and confirmed", async () => {
    expect(await processText(text(SAM, "2"), phone)).toBe("done");
    const [b] = await db()`select * from practice_os.consult_bookings where contact_phone = ${SAM}`;
    expect(b).toMatchObject({ status: "booked", calendar_provider: "calcom", contact_name: "Sam" });
    expect(b.reference).toMatch(/^FD-\d+$/);
    expect(new Date(b.starts_at).toISOString()).toBe("2026-11-04T20:00:00.000Z");
    expect(booked.at(-1)).toBe(b.reference);
    expect(sent.at(-1)!.body).toContain(`You're booked`);
    expect(sent.at(-1)!.body).toContain(b.reference);
    expect((await inquiryOf(SAM)).status).toBe("booked");
  });

  it("if the time was just taken, it says so and offers fresh times instead", async () => {
    await processVoicemail(vm(RILEY, "Hi, it's Riley, can I book a consult?"), phone);
    free = false;
    sent.length = 0;
    await processText(text(RILEY, "1"), phone);
    expect(sent.map((s) => s.body)[0]).toBe("Reyes Counseling: That time was just taken. New times are in the next text.");
    expect(sent[1].body).toContain("Open consult times");
    expect(await db()`select 1 from practice_os.consult_bookings where contact_phone = ${RILEY}`).toHaveLength(0);
  });

  it("a crisis voicemail gets the fixed reply and alerts the clinician, with no model and no approval", async () => {
    vi.mocked(extractVoicemail).mockClear();
    expect(await processVoicemail(vm(ALEX, "I don't want to live anymore"), phone)).toBe("crisis");
    expect(extractVoicemail).not.toHaveBeenCalled();
    const inq = await inquiryOf(ALEX);
    expect(inq).toMatchObject({ crisis_flag: true, status: "needs_clinician" });
    expect(await approvalsFor(inq.id)).toHaveLength(0);
    expect(sent).toEqual([
      { to: ALEX, body: CRISIS_REPLY },
      { to: CLINICIAN, body: expect.stringMatching(/^URGENT from Practice-OS Front Desk: a voicemail from \+13125550146/) },
    ]);
    expect(sent[1].body).not.toContain("live");
    const [alert] = await db()`select kind from practice_os.alerts where inquiry_id = ${inq.id}`;
    expect(alert.kind).toBe("crisis");
    const actions = (await db()`select action from practice_os.audit_log where subject_id = ${inq.id}::text`).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["crisis_detected", "crisis_reply_sent"]));
  });

  it("a crisis text is caught before the reply parser", async () => {
    await processText(text(ALEX, "2 but honestly I want to kill myself"), phone);
    expect(sent[0]).toEqual({ to: ALEX, body: CRISIS_REPLY });
  });

  it("STOP opts the number out; nothing more is offered to it", async () => {
    await processText(text(RILEY, "STOP"), phone);
    expect(await db()`select 1 from practice_os.sms_opt_outs where phone = ${RILEY}`).toHaveLength(1);
    const inq = await inquiryOf(RILEY);
    expect((await offerTimes(inq.id, { purpose: "book" })).outcome).toBe("opted_out");
    expect(sent).toEqual([{ to: RILEY, body: "Reyes Counseling: You're unsubscribed and won't get more texts. Reply START to resubscribe." }]);
  });

  it("a question goes to her inbox and the caller gets one passed-on text", async () => {
    await processText(text(SAM, "Do you take Blue Cross insurance?"), phone);
    await processText(text(SAM, "Also what is the fee?"), phone);
    const inq = await inquiryOf(SAM);
    const qs = await db()`select message from practice_os.alerts where inquiry_id = ${inq.id} and kind = 'question'`;
    expect(qs).toHaveLength(2);
    expect(sent.filter((s) => s.body.includes("passed your message"))).toHaveLength(1);
  });

  it("the day-before reminder goes out once", async () => {
    setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => new Date("2026-11-03T15:30:00Z") });
    expect(await queueReminders()).toBe(1);
    expect(sent.at(-1)!.body).toMatch(/^Reyes Counseling reminder: your free 15-minute phone consult is tomorrow, Wed at 2pm \(ref FD-\d+\)\. Reply R to reschedule or C to cancel\. Reply STOP to opt out\.$/);
    expect(await queueReminders()).toBe(0);
    setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => NOW });
  });

  it("checkFrontDesk reads new items once and skips them the second time", async () => {
    const item = text(SAM, "C");
    const listing = { ...phone, listInboundTexts: async () => [item] };
    setFrontDeskDeps({ phone: async () => listing, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => NOW });
    expect(await checkFrontDesk()).toMatchObject({ ran: true, texts: 1 });
    expect(await checkFrontDesk()).toMatchObject({ ran: true, texts: 0 });
    const [b] = await db()`select status from practice_os.consult_bookings where contact_phone = ${SAM}`;
    expect(b.status).toBe("cancelled");
    expect(sent.at(-1)!.body).toContain("is cancelled");
    setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => NOW });
  });
});
