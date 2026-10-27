// Calendar (UI-030) day labels and event lookup, kept free of React so they can be unit tested.

export type CalendarEventKind = "deadline" | "consult" | "post" | "done";

export type CalendarEvent = {
  /** The day, as a Date or "YYYY-MM-DD" (read as a local date, not UTC). */
  date: Date | string;
  kind: CalendarEventKind;
  /** Plain words for screen readers and the day list: "license renewal due". */
  label: string;
};

/** "YYYY-MM-DD" in local time, so a day never slips across midnight UTC. */
export function dayKey(d: Date | string): string {
  if (typeof d === "string") return d.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function groupByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const e of events) {
    const k = dayKey(e.date);
    map.set(k, [...(map.get(k) ?? []), e]);
  }
  return map;
}

/** What a screen reader hears for a day: "Tuesday, March 31, 2027, today: license renewal due". */
export function dayLabel(date: Date, events: CalendarEvent[] = [], flags: { today?: boolean; selected?: boolean } = {}): string {
  const base = date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const extras = [flags.today && "today", flags.selected && "selected"].filter(Boolean).join(", ");
  const what = events.map((e) => e.label).join("; ");
  return `${base}${extras ? `, ${extras}` : ""}${what ? `: ${what}` : ""}`;
}
