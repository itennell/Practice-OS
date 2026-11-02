// Front Desk privacy, end to end: every approval Front Desk queues names the
// caller by the masked number in its title, preview and result, while the
// payload the executor texts from keeps the full number. Fake phone and
// calendar; it writes inquiries, approvals and bookings and flips the Front
// Desk switches, so it runs only on a local throwaway database (localhost).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ?? "";
const localDb = /@(localhost|127\.0\.0\.1)[:/]/.test(url);

vi.mock("../lib/frontdesk/extract", async (orig) => {
  const real = await orig<typeof import("../lib/frontdesk/extract")>();
  // Stands in for muse-spark-1.3: never a name (so titles fall back to the number), intent from keywords.
  const fake = vi.fn(async (text: string, callerId: string | null) => {
    const intent = /appointment|consult|book/i.test(text) ? "book" : /insurance|fee|cost/i.test(text) ? "question" : "other";
    return real.vetExtraction({ name: null, callback_number: null, intent, summary: "Wants a first consult" }, callerId);
  });
  return { ...real, extractVoicemail: fake, readIntent: fake };
});

const { db, closeDb } = await import("../lib/db");
const { setFrontDeskDeps } = await import("../lib/frontdesk/deps");
const { processText, processVoicemail } = await import("../lib/frontdesk/ingest");
const { queueReminders } = await import("../lib/frontdesk/reminders");

const BOOKER = "+13125550171";
const ASKER = "+13125550172";
const NO_TIMES = "+13125550173";
const PHONES = [BOOKER, ASKER, NO_TIMES];
const tenDigits = (p: string) => p.replace(/\D/g, "").slice(-10);

const NOW = new Date("2026-11-02T16:00:00Z"); // Mon 10:00 am Chicago
const slot = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 15 * 60_000) });
const SLOTS = [slot("2026-11-03T16:00:00Z"), slot("2026-11-04T20:00:00Z"), slot("2026-11-05T22:00:00Z")];
let noSlots = false;

const phone = {
  vendor: "twilio" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  listVoicemails: async () => [],
  listInboundTexts: async () => [],
  sendText: async () => ({ id: `SM_priv_${Date.now()}_${Math.random()}` }),
};
const calendar = {
  provider: "calcom" as const,
  check: async () => ({ ok: true as const, label: "fake" }),
  openSlots: async () => (noSlots ? [] : SLOTS),
  isFree: async () => true,
  book: async (_s: unknown, reference: string) => ({ externalId: `bk_priv_${reference}` }),
  reschedule: async (id: string) => ({ externalId: id }),
  cancel: async () => {},
};
const deps = (now: Date) => setFrontDeskDeps({ phone: async () => phone, calendar: async () => calendar, timeZone: async () => "America/Chicago", now: () => now });

let n = 0;
const vm = (from: string, transcript: string) => ({
  id: `RE_priv_${++n}_${Date.now()}`,
  from,
  receivedAt: NOW,
  audio: async () => ({ bytes: Buffer.from("not a wav"), mime: "audio/mpeg" }),
  providerTranscript: transcript,
});
const text = (from: string, body: string) => ({ id: `SM_priv_in_${++n}_${Date.now()}`, from, body, receivedAt: NOW });

let savedRules: unknown;
const savedEnv = { DRY_RUN: process.env.DRY_RUN, FRONT_DESK_DEV_TWILIO: process.env.FRONT_DESK_DEV_TWILIO };
const restore = (name: keyof typeof savedEnv) => {
  if (savedEnv[name] === undefined) delete process.env[name];
  else process.env[name] = savedEnv[name];
};

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
  process.env.FRONT_DESK_DEV_TWILIO = "false";
  [{ front_desk_rules: savedRules }] = await db()`select front_desk_rules from practice_os.settings limit 1`;
  await db()`update practice_os.settings set front_desk_rules = ${db().json({ text_missed_callers: true, book_by_text: true, send_reminders: true } as never)}, timezone = 'America/Chicago'`;
  deps(NOW);
  await cleanup();
});

afterAll(async () => {
  if (!localDb) return;
  setFrontDeskDeps(null);
  await cleanup();
  await db()`update practice_os.settings set front_desk_rules = ${db().json(savedRules as never)}`;
  restore("DRY_RUN");
  restore("FRONT_DESK_DEV_TWILIO");
  await closeDb();
});

type Row = { kind: string; title: string; preview: unknown; payload: Record<string, unknown>; result: Record<string, unknown> | null };
const approvalsFor = async (p: string) =>
  db()<Row[]>`
    select kind, title, preview, payload, result from practice_os.approvals
    where payload ->> 'to' = ${p} or payload ->> 'inquiry_id' in (select id::text from practice_os.inquiries where contact_phone = ${p})
    order by created_at`;

function expectMasked(rows: Row[], p: string) {
  for (const r of rows) {
    const shown = `${r.title} ${JSON.stringify(r.preview)} ${JSON.stringify(r.result ?? {})}`;
    expect(shown.replace(/\D/g, ""), `${r.kind}: ${r.title}`).not.toContain(tenDigits(p));
    if (r.kind !== "consult_booking") expect(r.payload.to, r.kind).toBe(p);
  }
}

describe.skipIf(!localDb)("Front Desk approvals show only the masked number (local database only)", () => {
  it("consult times (offers), a pick-again reply and the booking (ingest), and the reminder", async () => {
    expect(await processVoicemail(vm(BOOKER, "Hi, I'd like to book a first consult."), phone)).toBe("done"); // offers.ts: consult times
    await processText(text(BOOKER, "R"), phone); // ingest.ts: quick sms_reply, "no consult to change"
    await processText(text(BOOKER, "2"), phone); // ingest.ts: consult_booking
    deps(new Date("2026-11-03T15:30:00Z"));
    try {
      expect(await queueReminders()).toBeGreaterThanOrEqual(1); // reminders.ts
    } finally {
      deps(NOW);
    }
    const rows = await approvalsFor(BOOKER);
    expect(rows.map((r) => r.kind)).toEqual(expect.arrayContaining(["text_consult_options", "sms_reply", "consult_booking"]));
    expect(rows.filter((r) => r.kind === "sms_reply").map((r) => r.payload.purpose)).toEqual(expect.arrayContaining(["reminder"]));
    expect(rows.some((r) => r.kind === "sms_reply" && r.title.includes("no consult to change"))).toBe(true);
    expect(rows.find((r) => r.kind === "text_consult_options")?.title).toBe("Text (•••) •••-0171 3 consult times");
    expectMasked(rows, BOOKER);
    // The executors ran on her rule: their results carry the masked number.
    const texted = rows.filter((r) => r.kind !== "consult_booking" && r.result).map((r) => r.result!.texted);
    expect(texted.length).toBeGreaterThan(0);
    for (const t of texted) expect(t).toBe("(•••) •••-0171");
  });

  it("a question passed on to her (offers.ts passToClinician)", async () => {
    await processVoicemail(vm(ASKER, "Hi, I'd like to book a consult."), phone);
    await processText(text(ASKER, "Do you take Blue Cross insurance?"), phone);
    const rows = await approvalsFor(ASKER);
    expect(rows.some((r) => r.payload.purpose === "passed_on")).toBe(true);
    expectMasked(rows, ASKER);
  });

  it("no open times (offers.ts)", async () => {
    noSlots = true;
    try {
      await processVoicemail(vm(NO_TIMES, "Hi, I'd like to book a consult."), phone);
    } finally {
      noSlots = false;
    }
    const rows = await approvalsFor(NO_TIMES);
    expect(rows.some((r) => r.title.includes("no open times"))).toBe(true);
    expectMasked(rows, NO_TIMES);
  });
});
