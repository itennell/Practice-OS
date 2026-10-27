// Date math for the compliance calendar. Dates are plain "YYYY-MM-DD" strings
// (no time, no zone), handled in UTC so a day is always a day.
//
// Federal due dates that land on a weekend or a legal holiday move to the next
// business day (IRC 7503). Legal holidays are the federal ones under 5 USC 6103
// plus DC Emancipation Day (Apr 16), as the IRS applies them.

export type ISODate = string;

const DAY_MS = 86_400_000;

export function toDate(iso: ISODate): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Not a YYYY-MM-DD date: ${iso}`);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) throw new Error(`Not a real date: ${iso}`);
  return d;
}

export function iso(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function ymd(year: number, month: number, day: number): ISODate {
  return iso(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(date: ISODate, days: number): ISODate {
  return iso(new Date(toDate(date).getTime() + days * DAY_MS));
}

/** Calendar months, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(date: ISODate, months: number): ISODate {
  const d = toDate(date);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), lastDay));
  return iso(target);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY_MS);
}

export function year(date: ISODate): number {
  return toDate(date).getUTCFullYear();
}

export function isWeekend(date: ISODate): boolean {
  const day = toDate(date).getUTCDay();
  return day === 0 || day === 6;
}

/** The nth weekday (0 = Sunday) of a month; n = -1 means the last one. */
function nthWeekday(y: number, month: number, weekday: number, n: number): ISODate {
  if (n === -1) {
    const last = new Date(Date.UTC(y, month, 0));
    const back = (last.getUTCDay() - weekday + 7) % 7;
    return iso(new Date(last.getTime() - back * DAY_MS));
  }
  const first = new Date(Date.UTC(y, month - 1, 1));
  const ahead = (weekday - first.getUTCDay() + 7) % 7;
  return iso(new Date(first.getTime() + (ahead + (n - 1) * 7) * DAY_MS));
}

/** A fixed-date holiday on a Saturday is observed Friday, on a Sunday Monday (5 USC 6103(b)). */
function observed(date: ISODate): ISODate {
  const day = toDate(date).getUTCDay();
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map<number, Set<ISODate>>();

/** Observed federal legal holidays for a year, plus DC Emancipation Day. */
export function legalHolidays(y: number): Set<ISODate> {
  const cached = holidayCache.get(y);
  if (cached) return cached;
  const days = new Set<ISODate>([
    observed(ymd(y, 1, 1)), // New Year's Day
    nthWeekday(y, 1, 1, 3), // Martin Luther King Jr. Day
    nthWeekday(y, 2, 1, 3), // Washington's Birthday
    observed(ymd(y, 4, 16)), // DC Emancipation Day
    nthWeekday(y, 5, 1, -1), // Memorial Day
    observed(ymd(y, 6, 19)), // Juneteenth
    observed(ymd(y, 7, 4)), // Independence Day
    nthWeekday(y, 9, 1, 1), // Labor Day
    nthWeekday(y, 10, 1, 2), // Columbus Day
    observed(ymd(y, 11, 11)), // Veterans Day
    nthWeekday(y, 11, 4, 4), // Thanksgiving
    observed(ymd(y, 12, 25)), // Christmas
  ]);
  // Jan 1 of next year can be observed on Dec 31 of this one.
  const nextNewYear = observed(ymd(y + 1, 1, 1));
  if (year(nextNewYear) === y) days.add(nextNewYear);
  holidayCache.set(y, days);
  return days;
}

/** Observed federal holidays under 5 USC 6103 only (no DC Emancipation Day, which is an IRS rule). */
export function federalHolidays(y: number): Set<ISODate> {
  const dc = observed(ymd(y, 4, 16));
  return new Set([...legalHolidays(y)].filter((d) => d !== dc));
}

export function isBusinessDay(date: ISODate): boolean {
  return !isWeekend(date) && !legalHolidays(year(date)).has(date);
}

/** IRC 7503: a due date on a weekend or legal holiday moves to the next business day. */
export function rollForward(date: ISODate): ISODate {
  let d = date;
  while (!isBusinessDay(d)) d = addDays(d, 1);
  return d;
}

/** n business days after date (date itself not counted). */
export function addBusinessDays(date: ISODate, n: number): ISODate {
  let d = date;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isBusinessDay(d)) left--;
  }
  return d;
}

/** Today's date where the practice is (settings.timezone, default America/Chicago). */
export function todayIn(timeZone = "America/Chicago", now: Date = new Date()): ISODate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
