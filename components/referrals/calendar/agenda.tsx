"use client";

// Referrals › Calendar on a phone: the week as a list, grouped by day (only days
// with something on them), each meeting one 44px+ row that opens its details.

import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { byDay, dayParts, KIND_LABEL, timeRangeLabel, type Kind } from "./layout";
import type { Meeting } from "./api";
import { meetingName } from "./time-grid";

export function Agenda({ days, meetings, timeZone, today, onOpen }: { days: string[]; meetings: Meeting[]; timeZone: string; today: string; onOpen: (id: string) => void }) {
  const perDay = byDay(meetings, days, timeZone);
  const used = days.filter((d) => (perDay.get(d) ?? []).length > 0);
  return (
    <div className="flex flex-col gap-4" data-testid="calendar-agenda">
      {used.map((d) => {
        const p = dayParts(d);
        return (
          <section key={d} aria-label={`${p.weekday}, ${p.month} ${p.day}`} className="flex flex-col gap-2">
            <h3 className="text-small font-semibold text-[var(--fg-muted)]">
              {p.weekday}, {p.monthShort} {p.day}
              {d === today && <span className="ml-2 rounded-full bg-[var(--primary-bg)] px-2 py-0.5 text-[var(--primary-fg)]">Today</span>}
            </h3>
            <ul className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
              {(perDay.get(d) ?? []).map((m, i) => (
                <li key={m.id} className={cn(i > 0 && "border-t border-[var(--hairline)]")}>
                  <button
                    type="button"
                    onClick={() => onOpen(m.id)}
                    aria-label={meetingName(m, timeZone)}
                    className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--hairline)] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
                  >
                    <span aria-hidden className={cn("h-9 w-[3px] shrink-0 rounded-full", m.status === "done" ? "bg-[var(--status-done-fg)]" : "bg-[var(--accent-fg)]")} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{m.source_name}</span>
                      <span className="flex items-center gap-1 text-small text-[var(--fg-muted)] tabular-nums">
                        {m.status === "done" && <Check aria-hidden size={12} />}
                        {KIND_LABEL[m.kind as Kind]} · {timeRangeLabel(m, timeZone)}
                      </span>
                    </span>
                    <ChevronRight aria-hidden size={16} className="shrink-0 text-[var(--fg-muted)]" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
