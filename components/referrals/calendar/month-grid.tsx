"use client";

// Referrals › Calendar: the Month view. Whole weeks, Monday first, a small label for
// each meeting and "+N more" when a day is full. On a phone a day shows dots only;
// tapping a day (or "+N more") opens that day.

import { cn } from "@/lib/utils";
import { byDay, dayParts, KIND_LABEL, timeRangeLabel, wallTime, clockLabel, type Kind } from "./layout";
import type { Meeting } from "./api";
import { meetingName } from "./time-grid";

const SHOWN = 2;
const HEADINGS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  days,
  month,
  meetings,
  timeZone,
  today,
  onOpen,
  onDay,
}: {
  days: string[];
  /** "2026-11": days outside it are muted. */
  month: string;
  meetings: Meeting[];
  timeZone: string;
  today: string;
  onOpen: (id: string) => void;
  onDay: (day: string) => void;
}) {
  const perDay = byDay(meetings, days, timeZone);
  return (
    <div className="overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]" data-testid="calendar-month">
      <div aria-hidden className="grid grid-cols-7 border-b border-[var(--hairline)]">
        {HEADINGS.map((h) => (
          <span key={h} className="py-2 text-center text-small font-medium text-[var(--fg-muted)]">
            {h}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const p = dayParts(d);
          const list = perDay.get(d) ?? [];
          const out = d.slice(0, 7) !== month;
          const more = list.length - SHOWN;
          return (
            <div
              key={d}
              className={cn(
                "flex min-h-[4.5rem] min-w-0 flex-col gap-1 border-[var(--hairline)] p-1 md:min-h-28 md:p-1.5",
                i % 7 !== 0 && "border-l",
                i >= 7 && "border-t",
                out && "bg-[var(--hairline)]",
              )}
            >
              <button
                type="button"
                onClick={() => onDay(d)}
                aria-label={`${p.weekday}, ${p.month} ${p.day}${list.length ? `: ${list.length} meeting${list.length === 1 ? "" : "s"}` : ""}. Open this day`}
                className={cn(
                  "flex h-touch w-full items-start justify-center rounded-[10px] pt-1 text-small font-semibold tabular-nums hover:bg-[var(--hairline)] md:size-touch md:w-auto md:items-center md:justify-center md:pt-0 md:self-start",
                  "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
                  out && "text-[var(--fg-muted)]",
                )}
              >
                <span className={cn("flex size-7 items-center justify-center rounded-full", d === today && "bg-[var(--primary-bg)] text-[var(--primary-fg)]")}>{p.day}</span>
              </button>
              {/* Phone: one dot per meeting (the day button opens them). */}
              {list.length > 0 && (
                <span aria-hidden className="flex flex-wrap justify-center gap-0.5 md:hidden">
                  {list.slice(0, 4).map((m) => (
                    <span key={m.id} className={cn("size-1.5 rounded-full", m.status === "done" ? "bg-[var(--status-done-fg)]" : "bg-[var(--accent-fg)]")} />
                  ))}
                </span>
              )}
              <ul className="hidden min-w-0 flex-col gap-0.5 md:flex">
                {list.slice(0, SHOWN).map((m) => (
                  <li key={m.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpen(m.id)}
                      aria-label={meetingName(m, timeZone)}
                      title={`${KIND_LABEL[m.kind as Kind]} · ${m.source_name}, ${timeRangeLabel(m, timeZone)}`}
                      className={cn(
                        "flex min-h-7 w-full min-w-0 items-center gap-1 rounded-[8px] px-1.5 text-left text-small hover:bg-[var(--hairline)]",
                        "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
                        m.status === "done" && "text-[var(--fg-muted)]",
                      )}
                    >
                      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", m.status === "done" ? "bg-[var(--status-done-fg)]" : "bg-[var(--accent-fg)]")} />
                      <span className="shrink-0 tabular-nums text-[var(--fg-muted)]">{clockLabel(wallTime(m.starts_at, timeZone)).replace(":00", "")}</span>
                      <span className="truncate">{m.source_name}</span>
                    </button>
                  </li>
                ))}
                {more > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => onDay(d)}
                      className="min-h-7 rounded-[8px] px-1.5 text-small font-medium text-[var(--link)] hover:bg-[var(--hairline)] outline-none focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
                    >
                      +{more} more
                    </button>
                  </li>
                )}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
