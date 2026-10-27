"use client";

import { useState } from "react";
import { GlassCard } from "@/components/ui";
import { Calendar, type CalendarEvent } from "../calendar";
import { dayKey, groupByDay } from "../calendar-labels";

// Fixed "today" so the lab and its screenshots never drift.
const TODAY = new Date(2026, 9, 27);

const EVENTS: CalendarEvent[] = [
  { date: "2026-10-30", kind: "consult", label: "[Sample] consult with Sam Example at 2 pm" },
  { date: "2026-11-04", kind: "deadline", label: "[Sample] CAQH re-attestation due" },
  { date: "2026-11-04", kind: "consult", label: "[Sample] consult with Jordan Lee at 10 am" },
  { date: "2026-11-10", kind: "post", label: "[Sample] post: How to book a first session" },
  { date: "2026-11-16", kind: "deadline", label: "[Sample] PLLC annual report due" },
  { date: "2026-10-20", kind: "done", label: "[Sample] CE hours logged" },
];

const KEY: { kind: CalendarEvent["kind"]; name: string; color: string }[] = [
  { kind: "deadline", name: "Deadline", color: "var(--event-deadline)" },
  { kind: "consult", name: "Consult", color: "var(--event-consult)" },
  { kind: "post", name: "Post", color: "var(--event-post)" },
  { kind: "done", name: "Done", color: "var(--event-done)" },
];

export default function CalendarLab() {
  const [selected, setSelected] = useState<Date | undefined>(new Date(2026, 10, 4));
  const byDay = groupByDay(EVENTS);
  const onDay = selected ? (byDay.get(dayKey(selected)) ?? []) : [];

  return (
    <div className="grid gap-6 md:grid-cols-[auto_1fr]">
      <GlassCard className="w-fit p-4 sm:p-5">
        <Calendar events={EVENTS} selected={selected} onSelect={setSelected} today={TODAY} />
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-small text-[var(--fg-muted)]">
          {KEY.map((k) => (
            <li key={k.kind} className="flex items-center gap-1.5">
              <span aria-hidden className="size-2 rounded-full" style={{ background: k.color }} />
              {k.name}
            </li>
          ))}
        </ul>
      </GlassCard>

      <GlassCard className="p-6">
        <h2 className="label-caps">
          {selected ? selected.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : "Pick a day"}
        </h2>
        <ul aria-live="polite" className="mt-3 space-y-2">
          {onDay.length === 0 ? (
            <li className="text-small text-[var(--fg-muted)]">Nothing on this day.</li>
          ) : (
            onDay.map((e) => <li key={e.label}>{e.label}</li>)
          )}
        </ul>
      </GlassCard>
    </div>
  );
}
