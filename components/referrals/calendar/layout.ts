// Referrals › Calendar: the pure layout helpers (no React, no database), so the
// grid's sums are tested on fixed dates (tests/referrals-calendar-layout.test.ts).
//
// Every day is a calendar day in her practice time zone ("YYYY-MM-DD"), and every
// position is read from the wall clock in that zone (zonedTime / localDate), never
// by adding hours to an instant, so a DST change never shifts a block or a day.

import { localDate, zonedTime } from "@/lib/zone";

export type CalendarView = "day" | "week" | "month";
export type Range = { from: Date; to: Date };

/** The kinds and their usual length, as in lib/referrals/meetings.ts (that file reads the database, so the page can't import it; a test keeps the two equal). */
export const KINDS = ["coffee", "call", "meeting", "lunch_talk", "other"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { coffee: "Coffee", call: "Call", meeting: "Meeting", lunch_talk: "Lunch talk", other: "Meeting" };
export const KIND_MINUTES: Record<Kind, number> = { coffee: 45, call: 20, meeting: 60, lunch_talk: 60, other: 30 };

/** The hours the week and day grids show by default: 8am to 6pm. */
export const GRID_START = 8;
export const GRID_END = 18;

const pad = (n: number) => String(n).padStart(2, "0");

/** "2026-11-05": the calendar day of that instant in `timeZone`. */
export function dayKey(at: Date | string, timeZone: string): string {
  const d = localDate(new Date(at), timeZone);
  return `${d.year}-${pad(d.month)}-${pad(d.day)}`;
}

/** The calendar day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/** The Monday on or before `day`. */
export function mondayOf(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** Mon to Sun of the week holding `day`. */
export function weekDays(day: string): string[] {
  const mon = mondayOf(day);
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

/** The instant her day starts (midnight on her wall clock). */
export function dayStart(day: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  return zonedTime(y, m, d, 0, 0, timeZone);
}

/** The instant for a wall-clock time ("10:30") on a day in her zone. */
export function wallInstant(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return zonedTime(y, m, d, h, min, timeZone);
}

/** "10:30": the wall-clock time of an instant in her zone, on the 24-hour clock. */
export function wallTime(at: Date | string, timeZone: string): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(at)).map((x) => [x.type, x.value]),
  );
  return `${p.hour}:${p.minute}`;
}

/** Minutes after her midnight on `day` (negative before it, past 1440 after it), read off the wall clock. */
export function minutesInto(at: Date | string, day: string, timeZone: string): number {
  const k = dayKey(at, timeZone);
  const [h, m] = wallTime(at, timeZone).split(":").map(Number);
  const minutes = h * 60 + m;
  if (k === day) return minutes;
  // Another day: whole days of difference (calendar days, so 24h even across DST) plus its wall time.
  const days = Math.round((Date.parse(`${k}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);
  return days * 1440 + minutes;
}

/** The first day of each view's span (Monday for a week, the Monday on or before the 1st for a month) and the days it shows. */
export function viewDays(view: CalendarView, anchor: string): string[] {
  if (view === "day") return [anchor];
  if (view === "week") return weekDays(anchor);
  // Whole weeks, Monday to Sunday, from the week of the 1st to the week of the last day: 4 to 6 rows.
  const first = `${anchor.slice(0, 7)}-01`;
  const last = addDays(stepAnchor("month", first, 1), -1);
  const end = addDays(mondayOf(last), 6);
  const days: string[] = [];
  for (let d = mondayOf(first); d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The instants that open and close a view (the last day included), for GET ?from&to. */
export function viewRange(view: CalendarView, anchor: string, timeZone: string): Range {
  const days = viewDays(view, anchor);
  return { from: dayStart(days[0], timeZone), to: dayStart(addDays(days[days.length - 1], 1), timeZone) };
}

/** The anchor one step back or forward: a day, a week, or a month (kept on the 1st). */
export function stepAnchor(view: CalendarView, anchor: string, step: -1 | 1): string {
  if (view === "day") return addDays(anchor, step);
  if (view === "week") return addDays(mondayOf(anchor), 7 * step);
  const [y, m] = anchor.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + step, 1, 12));
  return d.toISOString().slice(0, 10);
}

type Timed = { starts_at: string; ends_at: string };

/** The week's columns: Mon to Fri, plus Sat and Sun only when something falls on them. */
export function visibleWeekDays(days: string[], meetings: Timed[], timeZone: string): string[] {
  const used = new Set(meetings.flatMap((m) => [dayKey(m.starts_at, timeZone), dayKey(new Date(new Date(m.ends_at).getTime() - 1), timeZone)]));
  return days.filter((d) => weekdayOf(d) % 6 !== 0 || used.has(d));
}

/** The grid's hours: 8am to 6pm, widened to the whole hour around anything earlier or later on the shown days. */
export function gridHours(meetings: Timed[], days: string[], timeZone: string): { start: number; end: number } {
  let start = GRID_START * 60;
  let end = GRID_END * 60;
  for (const m of meetings) {
    for (const d of days) {
      const a = minutesInto(m.starts_at, d, timeZone);
      const b = minutesInto(m.ends_at, d, timeZone);
      if (b <= 0 || a >= 1440) continue;
      start = Math.min(start, Math.max(0, a));
      end = Math.max(end, Math.min(1440, b));
    }
  }
  return { start: Math.floor(start / 60), end: Math.ceil(end / 60) };
}

/** Where a block sits in a day's column, as percentages of the grid's height. Null when it isn't on that day's grid. */
export function blockBox(m: Timed, day: string, timeZone: string, hours: { start: number; end: number } = { start: GRID_START, end: GRID_END }) {
  const lo = hours.start * 60;
  const hi = hours.end * 60;
  const a = minutesInto(m.starts_at, day, timeZone);
  const b = minutesInto(m.ends_at, day, timeZone);
  if (b <= lo || a >= hi) return null;
  const top = Math.max(a, lo);
  const bottom = Math.min(b, hi);
  const span = hi - lo;
  return { top: ((top - lo) / span) * 100, height: ((bottom - top) / span) * 100, minutes: bottom - top, clippedTop: a < lo, clippedBottom: b > hi };
}

/** The now-line's place in today's column (percent), or null outside the grid's hours or on another day. */
export function nowOffset(now: Date, day: string, timeZone: string, hours: { start: number; end: number } = { start: GRID_START, end: GRID_END }): number | null {
  if (dayKey(now, timeZone) !== day) return null;
  const m = minutesInto(now, day, timeZone);
  if (m < hours.start * 60 || m > hours.end * 60) return null;
  return ((m - hours.start * 60) / ((hours.end - hours.start) * 60)) * 100;
}

/** Side-by-side lanes for blocks that overlap on one day (a done meeting can share a slot with a planned one). */
export function lanes<T extends Timed>(items: T[]): { item: T; lane: number; of: number }[] {
  const sorted = [...items].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at) || Date.parse(b.ends_at) - Date.parse(a.ends_at));
  const out: { item: T; lane: number; of: number }[] = [];
  let group: { item: T; lane: number; of: number }[] = [];
  let groupEnd = -Infinity;
  const laneEnds: number[] = [];
  const close = () => {
    const of = Math.max(1, ...group.map((g) => g.lane + 1));
    for (const g of group) g.of = of;
    out.push(...group);
    group = [];
    laneEnds.length = 0;
  };
  for (const item of sorted) {
    const s = Date.parse(item.starts_at);
    const e = Date.parse(item.ends_at);
    if (s >= groupEnd && group.length) close();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = e;
    group.push({ item, lane, of: 1 });
    groupEnd = Math.max(groupEnd === -Infinity ? e : groupEnd, e);
  }
  if (group.length) close();
  return out;
}

/** Meetings that touch each day, earliest first. */
export function byDay<T extends Timed>(meetings: T[], days: string[], timeZone: string): Map<string, T[]> {
  const out = new Map<string, T[]>(days.map((d) => [d, []]));
  for (const m of [...meetings].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))) {
    for (const d of days) {
      if (minutesInto(m.ends_at, d, timeZone) > 0 && minutesInto(m.starts_at, d, timeZone) < 1440) out.get(d)!.push(m);
    }
  }
  return out;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const short = (s: string) => s.slice(0, 3);

/** "Mon Nov 2" style parts of a day. */
export function dayParts(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const w = weekdayOf(day);
  return { year: y, month: MONTHS[m - 1], monthShort: short(MONTHS[m - 1]), day: d, weekday: WEEKDAYS[w], weekdayShort: short(WEEKDAYS[w]) };
}

/** The toolbar's label: "Nov 2 – 8, 2026", "Oct 26 – Nov 1, 2026", "Tuesday, Nov 3, 2026", "November 2026". */
export function rangeLabel(view: CalendarView, anchor: string): string {
  if (view === "day") {
    const p = dayParts(anchor);
    return `${p.weekday}, ${p.monthShort} ${p.day}, ${p.year}`;
  }
  if (view === "month") {
    const p = dayParts(`${anchor.slice(0, 7)}-01`);
    return `${p.month} ${p.year}`;
  }
  const days = weekDays(anchor);
  const a = dayParts(days[0]);
  const b = dayParts(days[6]);
  if (a.year !== b.year) return `${a.monthShort} ${a.day}, ${a.year} – ${b.monthShort} ${b.day}, ${b.year}`;
  if (a.month !== b.month) return `${a.monthShort} ${a.day} – ${b.monthShort} ${b.day}, ${b.year}`;
  return `${a.monthShort} ${a.day} – ${b.day}, ${b.year}`;
}

/** "10:00 am", "2:30 pm". */
export function clockLabel(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(m)} ${h < 12 ? "am" : "pm"}`;
}

/** "10:00–10:45 am", "11:30 am–12:30 pm" in her zone. */
export function timeRangeLabel(m: Timed, timeZone: string): string {
  const a = clockLabel(wallTime(m.starts_at, timeZone));
  const b = clockLabel(wallTime(m.ends_at, timeZone));
  return a.slice(-2) === b.slice(-2) ? `${a.slice(0, -3)}–${b}` : `${a}–${b}`;
}

/** "8 am", "12 pm": the hour labels down the side. */
export function hourLabel(h: number): string {
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour} ${h % 24 < 12 ? "am" : "pm"}`;
}

/** "Thursday, Nov 5, 10:00–10:45 am". */
export function whenLabel(m: Timed, timeZone: string): string {
  const p = dayParts(dayKey(m.starts_at, timeZone));
  return `${p.weekday}, ${p.monthShort} ${p.day}, ${timeRangeLabel(m, timeZone)}`;
}

/** The times she can pick in the form: every 15 minutes from 7am to 8pm. */
export function timeOptions(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let m = 7 * 60; m <= 20 * 60; m += 15) {
    const t = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    out.push({ value: t, label: clockLabel(t) });
  }
  return out;
}

export const DURATIONS = [15, 20, 30, 45, 60, 90, 120] as const;
export function durationLabel(min: number): string {
  if (min < 60) return `${min} minutes`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return `${h === 1 ? "1 hour" : `${h} hours`}${r ? ` ${r} minutes` : ""}`;
}

/** The next quarter hour after `now` on her clock, as a day and a time the form can show (never before 7am or after 8pm). */
export function nextFreeStart(now: Date, timeZone: string): { day: string; time: string } {
  const day = dayKey(now, timeZone);
  const mins = minutesInto(now, day, timeZone);
  const next = Math.ceil((mins + 1) / 15) * 15 + 60; // an hour out, on the quarter hour
  if (next < 7 * 60) return { day, time: "09:00" };
  if (next > 20 * 60) return { day: addDays(day, 1), time: "09:00" };
  return { day, time: `${pad(Math.floor(next / 60))}:${pad(next % 60)}` };
}
