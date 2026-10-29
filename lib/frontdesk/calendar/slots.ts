import { localDate, zonedTime } from "./zone";
import type { Slot } from "./types";

// Plain code: which consult times to offer. Three times on three different
// days when possible, nothing sooner than two hours from now.

export const CONSULT_MINUTES = 15;
export const LEAD_MS = 2 * 60 * 60 * 1000;

export function pickThree(slots: Slot[], now: Date, timeZone: string): Slot[] {
  const future = slots.filter((s) => s.start.getTime() >= now.getTime() + LEAD_MS).sort((a, b) => a.start.getTime() - b.start.getTime());
  const picked: Slot[] = [];
  const days = new Set<string>();
  for (const s of future) {
    const d = localDate(s.start, timeZone);
    const key = `${d.year}-${d.month}-${d.day}`;
    if (days.has(key)) continue;
    days.add(key);
    picked.push(s);
    if (picked.length === 3) return picked;
  }
  for (const s of future) {
    if (picked.length === 3) break;
    if (!picked.some((p) => p.start.getTime() === s.start.getTime())) picked.push(s);
  }
  return picked.sort((a, b) => a.start.getTime() - b.start.getTime());
}

export type Hours = { weekdays: number[]; startHour: number; endHour: number };
/** Her open days (clinician_profile.office_hours) with a 9 to 5 consult window. */
export const DEFAULT_HOURS: Hours = { weekdays: [1, 2, 3, 4, 5], startHour: 9, endHour: 17 };

/** Every half-hour consult start inside her hours between `from` and `to` (Google has no booking page of its own). */
export function candidateSlots(from: Date, to: Date, hours: Hours, timeZone: string, minutes = CONSULT_MINUTES): Slot[] {
  const out: Slot[] = [];
  const first = localDate(from, timeZone);
  for (let i = 0; i < 31; i++) {
    const noon = zonedTime(first.year, first.month, first.day + i, 12, 0, timeZone);
    if (noon > to && i > 0) break;
    const d = localDate(noon, timeZone);
    if (!hours.weekdays.includes(d.weekday)) continue;
    for (let m = hours.startHour * 60; m + minutes <= hours.endHour * 60; m += 30) {
      const start = zonedTime(d.year, d.month, d.day, Math.floor(m / 60), m % 60, timeZone);
      const end = new Date(start.getTime() + minutes * 60_000);
      if (start >= from && end <= to) out.push({ start, end });
    }
  }
  return out;
}

export function overlaps(a: Slot, busy: Array<{ start: Date; end: Date }>): boolean {
  return busy.some((b) => a.start < b.end && b.start < a.end);
}
