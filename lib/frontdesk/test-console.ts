import { randomUUID } from "node:crypto";
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { db } from "../db";
import type { CalendarAdapter, Slot } from "./calendar/types";
import { alertPhone } from "./crisis";
import { deps } from "./deps";
import { processVoicemail } from "./ingest";
import { prettyPhone } from "./phone/numbers";
import type { PhoneAdapter, Voicemail } from "./phone/types";
import { TEST_TEXT } from "./test-text";

export { TEST_TEXT };

// "Test your Front Desk" on the Front Desk page.
//
// Send a test text: one fixed text to HER OWN alert phone (settings.alert_phone)
// and nobody else. The request carries no number and the approval carries no
// number: the executor reads alert_phone again when she approves, so nothing
// typed, queued or edited can point it at someone else. It still goes through
// the approval gate and DRY_RUN.
//
// Simulate a voicemail: a [Sample] voicemail through the real pipeline
// (transcript stand-in, crisis check, private-detail check, Muse or the keyword
// fallback, consult times as a pending approval) on a stand-in phone that
// cannot text anyone. Works with no phone, no calendar and no internet.

export class TestConsoleError extends Error {}

/** Queues the test text. The phone number is never an input. */
export async function queueTestText(): Promise<{ approvalId: string; to: string }> {
  const to = await alertPhone();
  if (!to) throw new TestConsoleError("Add your own cell phone for alerts first (Settings, or the onboarding step \"Your phone for urgent alerts\").");
  const approvalId = await queueApproval({
    kind: "sms_reply",
    title: "Send a test text to your phone",
    preview: { to: `Your phone, ${prettyPhone(to)}`, text: TEST_TEXT },
    payload: { test: true },
    createdBy: "front_desk_test",
  });
  return { approvalId, to: prettyPhone(to) };
}

export const SAMPLE_CALLER = "+13125550188"; // 555-01xx: set aside for fiction

export const SAMPLE_TRANSCRIPTS = {
  booking: "Hi, this is a sample caller. I'd like to book a first consult, maybe one evening next week. You can text me at this number. Thanks.",
  crisis: "Hi, this is a sample caller testing the safety check. I don't want to live anymore.",
} as const;
export type SampleKind = keyof typeof SAMPLE_TRANSCRIPTS;

/** The stand-in phone: lists nothing, and its "texts" go nowhere. */
export const samplePhone: PhoneAdapter = {
  vendor: "sample",
  check: async () => ({ ok: true, label: "Sample phone" }),
  listVoicemails: async () => [],
  listInboundTexts: async () => [],
  sendText: async () => ({ id: `sample-${randomUUID()}` }),
};

/** Three times on the next weekdays at 10am, 2pm and 4pm (her time zone), for when no calendar is connected. */
export function sampleCalendar(now: Date, timeZone: string): CalendarAdapter {
  const slots: Slot[] = [];
  const hours = [10, 14, 16];
  for (let d = 1; slots.length < 3 && d < 10; d++) {
    const day = new Date(now.getTime() + d * 86_400_000);
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(day);
    if (weekday === "Sat" || weekday === "Sun") continue;
    const ymd = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(day);
    const hour = hours[slots.length];
    // Find the UTC instant whose local hour in her zone is `hour` on that day.
    const guess = new Date(`${ymd}T${String(hour).padStart(2, "0")}:00:00Z`);
    const localHour = Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(guess));
    const start = new Date(guess.getTime() + (hour - localHour) * 3_600_000);
    slots.push({ start, end: new Date(start.getTime() + 15 * 60_000) });
  }
  return {
    provider: "calcom",
    check: async () => ({ ok: true, label: "Sample calendar" }),
    openSlots: async () => slots,
    isFree: async () => false, // a sample can never book
    book: async () => {
      throw new Error("A [Sample] consult can't be booked.");
    },
    reschedule: async () => {
      throw new Error("A [Sample] consult can't be moved.");
    },
    cancel: async () => {},
  };
}

/** Runs one [Sample] voicemail through the real pipeline. Returns its inquiry. */
export async function simulateVoicemail(kind: SampleKind): Promise<{ inquiryId: string; outcome: string; usedSampleCalendar: boolean }> {
  const { calendar, timeZone, now } = deps();
  const real = await calendar().catch(() => null);
  const v: Voicemail = {
    id: `sample-${randomUUID()}`,
    from: SAMPLE_CALLER,
    receivedAt: now(),
    seconds: 14,
    // Not a WAV, so Muse transcription is skipped and this stands in for the transcript.
    audio: async () => ({ bytes: Buffer.from("sample"), mime: "text/plain" }),
    providerTranscript: SAMPLE_TRANSCRIPTS[kind],
  };
  const outcome = await processVoicemail(v, samplePhone, { calendar: real ?? sampleCalendar(now(), await timeZone()) });
  const [row] = await db()<{ inquiry_id: string }[]>`select inquiry_id from practice_os.messages where vendor = 'sample' and provider_sid = ${v.id}`;
  await db()`update practice_os.alerts set is_sample = true, message = '[Sample] ' || message where inquiry_id = ${row.inquiry_id} and not is_sample`;
  await db()`update practice_os.consult_offers set is_sample = true where inquiry_id = ${row.inquiry_id}`;
  await db()`
    update practice_os.approvals set title = '[Sample] ' || title
    where payload ->> 'inquiry_id' = ${row.inquiry_id} and title not like '[Sample]%'`;
  await audit({ actor: "clinician", action: "front_desk_sample_voicemail", subjectType: "inquiry", subjectId: row.inquiry_id, details: { kind, outcome } });
  return { inquiryId: row.inquiry_id, outcome, usedSampleCalendar: !real };
}
