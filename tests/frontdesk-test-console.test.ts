// "Test your Front Desk": the test text can only ever reach her own alert
// phone, and a [Sample] voicemail runs the real pipeline without texting anyone.
// Writes settings, approvals and inquiries, so it runs only on a local throwaway database.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { queueTestText, simulateVoicemail, sampleCalendar, SAMPLE_CALLER, TEST_TEXT, TestConsoleError } = await import("../lib/frontdesk/test-console");
const { approve } = await import("../lib/approvals");
const { CRISIS_REPLY } = await import("../lib/safety");

const MINE = "+13125550177";
const STRANGER = "+13125550178";
const sent: Array<{ to: string; body: string }> = [];
const NOW = new Date("2026-11-02T16:00:00Z"); // Mon 10:00 am Chicago

const phone = {
  vendor: "twilio" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  listVoicemails: async () => [],
  listInboundTexts: async () => [],
  sendText: async (to: string, body: string) => {
    sent.push({ to, body });
    return { id: `SM_console_${sent.length}_${Date.now()}` };
  },
};

const saved = { DRY_RUN: process.env.DRY_RUN, CLINICIAN_ALERT_PHONE: process.env.CLINICIAN_ALERT_PHONE };
let savedAlert: string | null = null;
const restore = (k: keyof typeof saved) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]));

async function cleanup() {
  await db()`delete from practice_os.approvals where created_by = 'front_desk_test' or payload ->> 'inquiry_id' in (
    select id::text from practice_os.inquiries where contact_phone = ${SAMPLE_CALLER})`;
  await db()`delete from practice_os.alerts where inquiry_id in (select id from practice_os.inquiries where contact_phone = ${SAMPLE_CALLER})`;
  await db()`delete from practice_os.inquiries where contact_phone = ${SAMPLE_CALLER}`;
}

beforeAll(async () => {
  if (!localDb) return;
  process.env.DRY_RUN = "false"; // safe: the phone here is a fake that only records
  delete process.env.CLINICIAN_ALERT_PHONE;
  [{ alert_phone: savedAlert }] = await db()`select alert_phone from practice_os.settings limit 1`;
  setFrontDeskDeps({ phone: async () => phone, calendar: async () => null, timeZone: async () => "America/Chicago", now: () => NOW });
  await cleanup();
});

afterAll(async () => {
  if (!localDb) return;
  setFrontDeskDeps(null);
  await cleanup();
  await db()`update practice_os.settings set alert_phone = ${savedAlert}`;
  restore("DRY_RUN");
  restore("CLINICIAN_ALERT_PHONE");
  await closeDb();
});

beforeEach(() => {
  sent.length = 0;
});

describe("sample calendar (plain code)", () => {
  it("offers three weekday times at 10am, 2pm and 4pm in her time zone", async () => {
    const slots = await sampleCalendar(new Date("2026-11-06T16:00:00Z"), "America/Chicago").openSlots(NOW, NOW); // a Friday
    const labels = slots.map((s) => s.start.toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", hour: "numeric" }));
    expect(labels).toEqual(["Mon 10 AM", "Tue 2 PM", "Wed 4 PM"]);
  });
});

describe.skipIf(!localDb)("test console (local database only)", () => {
  it("refuses the test text when she has no alert phone", async () => {
    await db()`update practice_os.settings set alert_phone = null`;
    await expect(queueTestText()).rejects.toBeInstanceOf(TestConsoleError);
  });

  it("the test text waits for approval and then goes to her alert phone only", async () => {
    await db()`update practice_os.settings set alert_phone = ${MINE}`;
    const { approvalId } = await queueTestText();
    const [row] = await db()`select status, payload from practice_os.approvals where id = ${approvalId}`;
    expect(row.status).toBe("pending");
    expect(row.payload).toEqual({ test: true }); // no number to tamper with
    expect(sent).toHaveLength(0);
    await approve(approvalId, { by: "test" });
    expect(sent).toEqual([{ to: MINE, body: TEST_TEXT }]);
  });

  it("a number or wording slipped into the approval is ignored", async () => {
    await db()`update practice_os.settings set alert_phone = ${MINE}`;
    const { approvalId } = await queueTestText();
    await db()`update practice_os.approvals set payload = ${db().json({ test: true, to: STRANGER, body: "something else" } as never)} where id = ${approvalId}`;
    await approve(approvalId, { by: "test" });
    expect(sent).toEqual([{ to: MINE, body: TEST_TEXT }]);
    expect(sent.some((s) => s.to === STRANGER)).toBe(false);
  });

  it("an alert phone changed after queueing is the one used: it is read when she approves", async () => {
    await db()`update practice_os.settings set alert_phone = ${MINE}`;
    const { approvalId } = await queueTestText();
    await db()`update practice_os.settings set alert_phone = null`;
    await approve(approvalId, { by: "test" });
    const [row] = await db()`select status from practice_os.approvals where id = ${approvalId}`;
    expect(row.status).toBe("failed");
    expect(sent).toHaveLength(0);
  });

  it("Simulate a voicemail: [Sample] inquiry, safety result, consult times waiting for her, nothing sent", async () => {
    await db()`update practice_os.settings set alert_phone = ${MINE}`;
    const { inquiryId, outcome, usedSampleCalendar } = await simulateVoicemail("booking");
    expect(outcome).toBe("done");
    expect(usedSampleCalendar).toBe(true);
    const [inq] = await db()`select is_sample, status, crisis_flag from practice_os.inquiries where id = ${inquiryId}`;
    expect(inq).toMatchObject({ is_sample: true, crisis_flag: false });
    const [msg] = await db()`select vendor, is_sample, meta from practice_os.messages where inquiry_id = ${inquiryId} and channel = 'voicemail'`;
    expect(msg).toMatchObject({ vendor: "sample", is_sample: true });
    expect(msg.meta.safety).toEqual({ crisis: null, private: [] });
    const approvals = await db()`select id, kind, status from practice_os.approvals where payload ->> 'inquiry_id' = ${inquiryId}`;
    expect(approvals.map((a) => [a.kind, a.status])).toEqual([["text_consult_options", "pending"]]);

    // Approving it, even with DRY_RUN off, only logs: a sample never reaches a phone.
    await approve(approvals[0].id, { by: "test" });
    expect(sent).toHaveLength(0);
    const [out] = await db()`select vendor, is_sample, meta from practice_os.messages where inquiry_id = ${inquiryId} and direction = 'outbound'`;
    expect(out).toMatchObject({ vendor: "sample", is_sample: true, meta: { dryRun: true } });
  });

  it("Simulate an urgent voicemail: the fixed 988 reply and her alert, no model call, nothing sent", async () => {
    await db()`update practice_os.settings set alert_phone = ${MINE}`;
    const [{ n: before }] = await db()`select count(*)::int as n from practice_os.model_calls`;
    const { inquiryId, outcome } = await simulateVoicemail("crisis");
    expect(outcome).toBe("crisis");
    const [{ n: after }] = await db()`select count(*)::int as n from practice_os.model_calls`;
    expect(after).toBe(before);
    expect(sent).toHaveLength(0);
    const [reply] = await db()`select body from practice_os.messages where inquiry_id = ${inquiryId} and direction = 'outbound'`;
    expect(reply.body).toBe(CRISIS_REPLY);
    const [alert] = await db()`select kind, message, is_sample from practice_os.alerts where inquiry_id = ${inquiryId}`;
    expect(alert).toMatchObject({ kind: "crisis", is_sample: true });
    expect(alert.message.startsWith("[Sample] ")).toBe(true);
    const [{ n: approvals }] = await db()`select count(*)::int as n from practice_os.approvals where payload ->> 'inquiry_id' = ${inquiryId}`;
    expect(approvals).toBe(0);
  });
});
