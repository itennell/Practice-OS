// The Referrals calendar: coffees, calls, meetings and lunch talks she plans
// with the people on her board (migration 047). Plain code. Notes are hers, about
// the meeting (where to park, what to bring); every note goes through the crisis
// check, the referral-value check (nothing of value for a referral) and the
// privacy guard (no client details) before it is saved (checkNote in ./contacts).
//
// Aeon never writes here directly: plan_referral_meeting (lib/aeon/tools-meetings.ts)
// queues a referral_meeting approval and lib/executors/referral_meeting.ts calls
// createMeeting once she approves.
//
// Times are instants (timestamptz). The open-slot finder works in her time zone
// (settings.timezone) on her open days (clinician_profile.office_hours) from 9 to
// 5, built from explicit wall-clock dates so a DST change never shifts a slot.
import type postgres from "postgres";
import { audit, type AuditEntry } from "../audit";
import { practiceTimeZone } from "../compliance/store";
import { db } from "../db";
import type { guard } from "../aeon/guard";
import { localDate, zonedTime } from "../frontdesk/calendar/zone";
import { checkNote, isSuppressed, suppressedList } from "./contacts";
import { canMarkDone, NOT_YET } from "./meeting-rules";
import type { ReferralSource } from "./store";

export const MEETING_KINDS = ["coffee", "call", "meeting", "lunch_talk", "other"] as const;
export type MeetingKind = (typeof MEETING_KINDS)[number];
export const MEETING_STATUSES = ["planned", "done", "canceled"] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];

export const MEETING_LABEL: Record<MeetingKind, string> = {
  coffee: "Coffee",
  call: "Call",
  meeting: "Meeting",
  lunch_talk: "Lunch talk",
  other: "Meeting",
};

/** How long each kind usually takes, in minutes, when no length is given. */
export const DEFAULT_MINUTES: Record<MeetingKind, number> = { coffee: 45, call: 20, meeting: 60, lunch_talk: 60, other: 30 };

/** Her open window on an open day, in her time zone. */
export type WorkHours = { weekdays: number[]; startHour: number; endHour: number; closedOn: string[] };
/** Mon to Fri, 9 to 5 (no office hours saved). */
export const DEFAULT_WORK_HOURS: WorkHours = { weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17, closedOn: [] };

export const MAX_RANGE_DAYS = 62;
const MAX_MINUTES = 8 * 60;
const SLOT_STEP_MINUTES = 30;

export type Meeting = {
  id: string;
  source_id: string;
  source_name: string;
  kind: MeetingKind;
  starts_at: string;
  ends_at: string;
  location: string | null;
  notes: string | null;
  status: MeetingStatus;
  approval_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_sample: boolean;
};

export type Range = { from: Date; to: Date };
export type Slot = { start: Date; end: Date };
type Check = (t: string) => ReturnType<typeof guard>;
/** Who saved it: her, or the executor running her approval of Aeon's plan. */
export type Who = Extract<AuditEntry["actor"], "clinician" | "aeon" | "executor">;

export class MeetingError extends Error {}

const SELECT = (sql: postgres.Sql) => sql`
  select m.id, m.source_id, s.name as source_name, m.kind, m.starts_at, m.ends_at, m.location, m.notes, m.status,
         m.approval_id, m.created_by, m.created_at, m.updated_at, m.is_sample
    from practice_os.referral_meetings m join practice_os.referral_sources s on s.id = m.source_id`;

type Row = Omit<Meeting, "starts_at" | "ends_at" | "created_at" | "updated_at"> & { starts_at: Date; ends_at: Date; created_at: Date; updated_at: Date };
const iso = (d: Date) => new Date(d).toISOString();
const toMeeting = (r: Row): Meeting => ({ ...r, starts_at: iso(r.starts_at), ends_at: iso(r.ends_at), created_at: iso(r.created_at), updated_at: iso(r.updated_at) });

/** A real instant from an ISO string or a Date, or a plain-words error. */
export function toInstant(v: unknown, what: string): Date {
  const d = v instanceof Date ? v : typeof v === "string" && v.trim() ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) throw new MeetingError(`I couldn't read ${what}. Write it like 2026-11-05T10:00:00-06:00.`);
  return d;
}

/** A range she can read: from before to, at most MAX_RANGE_DAYS long. */
export function checkRange(range: Range): Range {
  if (!(range.to > range.from)) throw new MeetingError("The end of the range has to be after its start.");
  if (range.to.getTime() - range.from.getTime() > MAX_RANGE_DAYS * 86_400_000) throw new MeetingError(`Pick a range of ${MAX_RANGE_DAYS} days or less.`);
  return range;
}

function cleanText(v: unknown, max: number, what: string): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v !== "string") throw new MeetingError(`${what} has to be text.`);
  const t = v.trim();
  if (!t) return null;
  if (t.length > max) throw new MeetingError(`Keep ${what.toLowerCase()} under ${max} characters.`);
  return t;
}

function checkTimes(starts: Date, ends: Date) {
  if (!(ends > starts)) throw new MeetingError("The meeting has to end after it starts.");
  if (ends.getTime() - starts.getTime() > MAX_MINUTES * 60_000) throw new MeetingError("Keep a meeting to 8 hours or less.");
}

/** The place and the note are her free text: both go through the crisis, referral-value and privacy checks. */
async function screenNotes(notes: string | null, check?: Check, by?: string): Promise<void> {
  if (!notes) return;
  const refused = await checkNote(notes, check, { by });
  if (refused) throw new MeetingError(refused);
}

export const PAST_TIME = "That time has passed. Ask Aeon for a new one.";

/** One lock for every write that books time, so two saves can't take the same slot at once. */
const BOOKING_LOCK = "practice_os.referral_meetings:booking";

/** Throws when a planned meeting (other than `except`) overlaps the time. Run inside the booking lock. */
async function refuseClash(tx: postgres.TransactionSql, starts: Date, ends: Date, except: string | null): Promise<void> {
  const [clash] = await tx<{ id: string }[]>`
    select id from practice_os.referral_meetings
     where status = 'planned' and starts_at < ${ends} and ends_at > ${starts} and (${except}::uuid is null or id <> ${except}::uuid)
     limit 1`;
  if (clash) throw new MeetingError("Something is already planned at that time. Pick another time.");
}

/** Why Aeon may not plan a meeting with this card (do-not-contact, Not a fit), or null. */
export async function meetingBlocked(
  source: Pick<ReferralSource, "name" | "npi" | "stage"> & Partial<Pick<ReferralSource, "organization" | "npi_type" | "address" | "city" | "zip" | "sensitive">>,
  sql?: postgres.Sql,
): Promise<string | null> {
  // A sensitive (DV/SA) organization: no meeting at a place, ever (checked first, with no database read).
  if (source.sensitive) return `${source.name} is an organization Aeon keeps private, so I won't plan a meeting with them. Reach them through their public line only.`;
  sql ??= db();
  if (isSuppressed(source, await suppressedList(sql))) return `${source.name} is on your do-not-contact list, so I won't plan a meeting with them.`;
  if (source.stage === "not_a_fit") return `${source.name} is in Not a fit, so I won't plan a meeting with them. Move the card back first if that changed.`;
  return null;
}

/** Her meetings that overlap the range, earliest first. Canceled ones only when asked. */
export async function listMeetings(range: Range, opts: { includeCanceled?: boolean } = {}, sql: postgres.Sql = db()): Promise<Meeting[]> {
  checkRange(range);
  const rows = await sql<Row[]>`
    ${SELECT(sql)}
     where m.starts_at < ${range.to} and m.ends_at > ${range.from}
       and (${opts.includeCanceled === true} or m.status <> 'canceled')
     order by m.starts_at, m.id`;
  return rows.map(toMeeting);
}

export async function getMeeting(id: string, sql: postgres.Sql = db()): Promise<Meeting | null> {
  const [row] = await sql<Row[]>`${SELECT(sql)} where m.id = ${id}`;
  return row ? toMeeting(row) : null;
}

export type CreateInput = {
  sourceId: string;
  kind: MeetingKind;
  startsAt: Date | string;
  endsAt?: Date | string | null;
  location?: string | null;
  notes?: string | null;
  by: Who;
  approvalId?: string | null;
};

/** Saves one planned meeting. Throws MeetingError in plain words. A second call for the same approval returns the first row. */
export async function createMeeting(input: CreateInput, sql: postgres.Sql = db(), check?: Check, now?: Date): Promise<{ meeting: Meeting; already: boolean }> {
  if (!MEETING_KINDS.includes(input.kind)) throw new MeetingError("Pick coffee, call, meeting, lunch talk or other.");
  const starts = toInstant(input.startsAt, "when it starts");
  const ends = input.endsAt ? toInstant(input.endsAt, "when it ends") : new Date(starts.getTime() + DEFAULT_MINUTES[input.kind] * 60_000);
  checkTimes(starts, ends);
  const location = cleanText(input.location, 200, "The place");
  const notes = cleanText(input.notes, 500, "The note");
  const approvalId = input.approvalId ?? null;
  // A retried approval returns the meeting it already made, before any other check.
  if (approvalId) {
    const [had] = await sql<{ id: string }[]>`select id from practice_os.referral_meetings where approval_id = ${approvalId}`;
    if (had) return { meeting: (await getMeeting(had.id, sql))!, already: true };
  }
  if (starts.getTime() <= (now ?? new Date()).getTime()) throw new MeetingError(PAST_TIME);
  await screenNotes(location, check, input.by);
  await screenNotes(notes, check, input.by);
  const [card] = await sql<{ id: string }[]>`select id from practice_os.referral_sources where id = ${input.sourceId}`;
  if (!card) throw new MeetingError("That referral source is no longer on the board.");

  const saved = (await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${BOOKING_LOCK}))`;
    if (approvalId) {
      const [had] = await tx<{ id: string }[]>`select id from practice_os.referral_meetings where approval_id = ${approvalId}`;
      if (had) return { id: had.id, already: true };
    }
    await refuseClash(tx, starts, ends, null);
    const [inserted] = await tx<{ id: string }[]>`
      insert into practice_os.referral_meetings (source_id, kind, starts_at, ends_at, location, notes, approval_id, created_by)
      values (${input.sourceId}, ${input.kind}, ${starts}, ${ends}, ${location}, ${notes}, ${approvalId}, ${input.by})
      returning id`;
    return { id: inserted.id, already: false };
  })) as { id: string; already: boolean };
  if (saved.already) return { meeting: (await getMeeting(saved.id, sql))!, already: true };
  const row = { id: saved.id };
  // The audit keeps the kind and time, never the note's words.
  await audit(
    { actor: input.by, action: "referral_meeting_planned", approvalId, subjectType: "referral_source", subjectId: input.sourceId, details: { meeting_id: row.id, kind: input.kind, starts_at: starts.toISOString(), ends_at: ends.toISOString() } },
    sql,
  );
  return { meeting: (await getMeeting(row.id, sql))!, already: false };
}

export type UpdateInput = {
  kind?: MeetingKind;
  startsAt?: Date | string;
  endsAt?: Date | string;
  location?: string | null;
  notes?: string | null;
  status?: MeetingStatus;
  by: Who;
};

/** Changes a meeting. Only what is given changes. Null clears the place or the note. */
export async function updateMeeting(id: string, input: UpdateInput, sql: postgres.Sql = db(), check?: Check, now?: Date): Promise<Meeting> {
  const had = await getMeeting(id, sql);
  if (!had) throw new MeetingError("That meeting isn't on your calendar any more.");
  if (input.kind !== undefined && !MEETING_KINDS.includes(input.kind)) throw new MeetingError("Pick coffee, call, meeting, lunch talk or other.");
  if (input.status !== undefined && !MEETING_STATUSES.includes(input.status)) throw new MeetingError("Pick planned, done or canceled.");
  const kind = input.kind ?? had.kind;
  const starts = input.startsAt !== undefined ? toInstant(input.startsAt, "when it starts") : new Date(had.starts_at);
  // Moving the start without a new end keeps its length.
  const ends =
    input.endsAt !== undefined
      ? toInstant(input.endsAt, "when it ends")
      : input.startsAt !== undefined
        ? new Date(starts.getTime() + (new Date(had.ends_at).getTime() - new Date(had.starts_at).getTime()))
        : new Date(had.ends_at);
  checkTimes(starts, ends);
  const status = input.status ?? had.status;
  const moved = input.startsAt !== undefined || input.endsAt !== undefined;
  // Moving a meeting needs a time still ahead (marking a past one done or canceled is fine).
  if (moved && status === "planned" && starts.getTime() <= (now ?? new Date()).getTime()) throw new MeetingError(PAST_TIME);
  // Done means it happened: a meeting still ahead can't be marked done.
  if (input.status === "done" && had.status !== "done" && !canMarkDone(starts, now)) throw new MeetingError(NOT_YET);
  const location = input.location !== undefined ? cleanText(input.location, 200, "The place") : had.location;
  const notes = input.notes !== undefined ? cleanText(input.notes, 500, "The note") : had.notes;
  if (input.location !== undefined) await screenNotes(location, check, input.by);
  if (input.notes !== undefined) await screenNotes(notes, check, input.by);
  // A planned meeting that moved, or came back from canceled or done, must not overlap another.
  const recheck = status === "planned" && (moved || had.status !== "planned");
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${BOOKING_LOCK}))`;
    if (recheck) await refuseClash(tx, starts, ends, id);
    await tx`
      update practice_os.referral_meetings
         set kind = ${kind}, starts_at = ${starts}, ends_at = ${ends}, location = ${location}, notes = ${notes}, status = ${status}, updated_at = now()
       where id = ${id}`;
  });
  const changed = (["kind", "startsAt", "endsAt", "location", "notes", "status"] as const).filter((k) => input[k] !== undefined);
  await audit(
    { actor: input.by, action: status === "canceled" && had.status !== "canceled" ? "referral_meeting_canceled" : "referral_meeting_updated", subjectType: "referral_source", subjectId: had.source_id, details: { meeting_id: id, changed, status } },
    sql,
  );
  return (await getMeeting(id, sql))!;
}

/** Cancels a meeting (it stays, marked canceled). */
export function cancelMeeting(id: string, by: Who, sql: postgres.Sql = db()): Promise<Meeting> {
  return updateMeeting(id, { status: "canceled", by }, sql);
}

/** An hour of the day from office_hours: 9, 9.5 or "09:30". Null when missing or unreadable. */
export function hourOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const m = typeof v === "string" ? v.trim().match(/^(\d{1,2}):(\d{2})$/) : null;
  if (!m || Number(m[2]) > 59) return null;
  return Number(m[1]) + Number(m[2]) / 60;
}

/**
 * Her hours from clinician_profile.office_hours: the open days and closed dates, and her start and
 * end time when saved (start_hour / end_hour, as 9 or "09:00"), else 9 to 5. No profile: Mon to Fri,
 * 9 to 5. A database error is not hidden: it throws.
 */
export async function workHours(sql: postgres.Sql = db()): Promise<WorkHours> {
  const [row] = await sql<{ office_hours: Record<string, unknown> | null }[]>`
    select office_hours from practice_os.clinician_profile limit 1`;
  const oh = row?.office_hours ?? null;
  const days = oh?.weekdays;
  const weekdays = Array.isArray(days) && days.length && days.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6) ? (days as number[]) : DEFAULT_WORK_HOURS.weekdays;
  const closedOn = Array.isArray(oh?.closed_on) ? (oh.closed_on as unknown[]).filter((d): d is string => typeof d === "string") : [];
  const start = hourOf(oh?.start_hour);
  const end = hourOf(oh?.end_hour);
  const ok = start !== null && end !== null && start >= 0 && end <= 24 && start < end;
  return { weekdays, closedOn, startHour: ok ? start : DEFAULT_WORK_HOURS.startHour, endHour: ok ? end : DEFAULT_WORK_HOURS.endHour };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Open starts of `durationMin` inside her hours, on the half hour, between range.from and range.to,
 * that overlap nothing in `busy`. Each day's slots are built from that day's wall-clock date in
 * `timeZone` (zonedTime), never by adding hours to an instant, so a DST change can't shift them.
 */
export function openSlots(
  range: Range,
  durationMin: number,
  hours: WorkHours,
  timeZone: string,
  busy: Array<{ start: Date; end: Date }> = [],
  limit = 50,
  /** Nothing at or before this instant is offered. */
  now: Date = new Date(),
): Slot[] {
  checkRange(range);
  if (!Number.isInteger(durationMin) || durationMin < 5 || durationMin > MAX_MINUTES) throw new MeetingError("Pick a length from 5 minutes to 8 hours.");
  const out: Slot[] = [];
  const first = localDate(range.from, timeZone);
  for (let i = 0; i <= MAX_RANGE_DAYS + 1; i++) {
    // Noon of the i-th calendar day in her zone: Date.UTC normalises day overflow into the next month.
    const noonUtc = new Date(Date.UTC(first.year, first.month - 1, first.day + i, 12));
    const y = noonUtc.getUTCFullYear(), mo = noonUtc.getUTCMonth() + 1, d = noonUtc.getUTCDate();
    const dayStart = zonedTime(y, mo, d, 0, 0, timeZone);
    if (dayStart >= range.to) break;
    const weekday = noonUtc.getUTCDay();
    if (!hours.weekdays.includes(weekday)) continue;
    if (hours.closedOn.includes(`${y}-${pad(mo)}-${pad(d)}`)) continue;
    for (let m = Math.round(hours.startHour * 60); m + durationMin <= Math.round(hours.endHour * 60); m += SLOT_STEP_MINUTES) {
      const start = zonedTime(y, mo, d, Math.floor(m / 60), m % 60, timeZone);
      const endWall = m + durationMin;
      const end = zonedTime(y, mo, d, Math.floor(endWall / 60), endWall % 60, timeZone);
      if (start < range.from || end > range.to || start.getTime() <= now.getTime()) continue;
      if (busy.some((b) => start < b.end && b.start < end)) continue;
      out.push({ start, end });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Open slots for a new meeting: her hours and time zone, minus every planned meeting already on the calendar. */
export async function findOpenSlots(
  range: Range,
  durationMin: number,
  sql: postgres.Sql = db(),
  opts: { limit?: number; alsoBusy?: Array<{ start: Date; end: Date }>; now?: Date } = {},
): Promise<{ slots: Slot[]; timeZone: string; hours: WorkHours }> {
  checkRange(range);
  const [timeZone, hours, booked] = await Promise.all([practiceTimeZone(sql), workHours(sql), busyBetween(range, sql)]);
  return { slots: openSlots(range, durationMin, hours, timeZone, [...booked, ...(opts.alsoBusy ?? [])], opts.limit, opts.now ?? new Date()), timeZone, hours };
}

/** Planned meetings that overlap the range, as busy times. */
export async function busyBetween(range: Range, sql: postgres.Sql = db()): Promise<Array<{ start: Date; end: Date }>> {
  return sql<{ start: Date; end: Date }[]>`
    select starts_at as start, ends_at as "end" from practice_os.referral_meetings
     where status = 'planned' and starts_at < ${range.to} and ends_at > ${range.from}`;
}

/** Meetings Aeon planned that still wait for her approval, as busy times, so two plans never take the same slot. */
export async function pendingPlans(range: Range, sql: postgres.Sql = db()): Promise<Array<{ start: Date; end: Date }>> {
  const rows = await sql<{ starts_at: string; ends_at: string }[]>`
    select payload ->> 'starts_at' as starts_at, payload ->> 'ends_at' as ends_at from practice_os.approvals
     where kind = 'referral_meeting' and status in ('pending', 'running')`;
  return rows
    .map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }))
    .filter((b) => !Number.isNaN(b.start.getTime()) && !Number.isNaN(b.end.getTime()) && b.start < range.to && b.end > range.from);
}

/** The instants that open and close a span of her calendar days (YYYY-MM-DD, `to` included) in her zone. */
export function daysRange(fromDay: string, toDay: string, timeZone: string): Range {
  const [fy, fm, fd] = fromDay.split("-").map(Number);
  const [ty, tm, td] = toDay.split("-").map(Number);
  return { from: zonedTime(fy, fm, fd, 0, 0, timeZone), to: zonedTime(ty, tm, td + 1, 0, 0, timeZone) };
}

/** The calendar day `n` days after `day` (YYYY-MM-DD). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** "Thu Nov 5, 10:00 am" in her zone. */
export function meetingLabel(at: Date | string, timeZone: string): string {
  const d = new Date(at);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" }).formatToParts(d).map((x) => [x.type, x.value]));
  const day = `${p.weekday} ${p.month} ${p.day}`;
  const time = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(d).replace("AM", "am").replace("PM", "pm");
  return `${day}, ${time}`;
}
