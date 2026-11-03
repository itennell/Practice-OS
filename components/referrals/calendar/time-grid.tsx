"use client";

// Referrals › Calendar: the Week and Day grids. Days across, her hours (8am to 6pm,
// wider when a meeting falls outside) down the side in the practice time zone, each
// meeting a block sized by its length, and a line at the current time on today.
// Every block is a button: Tab reaches it, Enter opens its details.

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { blockBox, byDay, dayParts, gridHours, hourLabel, KIND_LABEL, lanes, nowOffset, timeRangeLabel, whenLabel, type Kind } from "./layout";
import type { Meeting } from "./api";

const HOUR_PX = 64;

export const blockClass = (m: Pick<Meeting, "status">) =>
  cn(
    "flex w-full flex-col items-start overflow-hidden rounded-[10px] border-l-[3px] px-2 py-1 text-left text-small transition-colors duration-150",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
    m.status === "done"
      ? "border-[var(--status-done-fg)] bg-[var(--status-done-bg)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
      : "border-[var(--accent-fg)] bg-[var(--status-running-bg)] text-[var(--fg)] hover:brightness-[0.97]",
  );

export function meetingName(m: Meeting, timeZone: string): string {
  return `${KIND_LABEL[m.kind as Kind]} with ${m.source_name}, ${whenLabel(m, timeZone)}${m.status === "done" ? ", done" : ""}`;
}

export function TimeGrid({
  days,
  meetings,
  timeZone,
  today,
  now,
  onOpen,
}: {
  days: string[];
  meetings: Meeting[];
  timeZone: string;
  today: string;
  now: Date;
  onOpen: (id: string) => void;
}) {
  const hours = gridHours(meetings, days, timeZone);
  const rows = Array.from({ length: hours.end - hours.start }, (_, i) => hours.start + i);
  const height = rows.length * HOUR_PX;
  const perDay = byDay(meetings, days, timeZone);
  const cols = `3.5rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-x-auto rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]" data-testid="calendar-grid">
      <div className={cn(days.length > 1 && "min-w-[44rem]")}>
        {/* Day headings */}
        <div className="grid border-b border-[var(--hairline)]" style={{ gridTemplateColumns: cols }}>
          <span aria-hidden />
          {days.map((d) => {
            const p = dayParts(d);
            const isToday = d === today;
            return (
              <div key={d} className="flex flex-col items-center gap-0.5 border-l border-[var(--hairline)] px-1 py-2 text-center">
                <span className="text-small text-[var(--fg-muted)]">{p.weekdayShort}</span>
                <span
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-body font-semibold tabular-nums",
                    isToday && "bg-[var(--primary-bg)] text-[var(--primary-fg)]",
                  )}
                >
                  {p.day}
                </span>
                {isToday && <span className="sr-only">today</span>}
              </div>
            );
          })}
        </div>

        <div className="relative grid" style={{ gridTemplateColumns: cols, height }}>
          {/* Hours down the side */}
          <div aria-hidden className="relative">
            {rows.map((h, i) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 text-small whitespace-nowrap text-[var(--fg-muted)] tabular-nums" style={{ top: i === 0 ? 10 : i * HOUR_PX }}>
                {hourLabel(h)}
              </span>
            ))}
          </div>

          {days.map((d) => {
            const p = dayParts(d);
            const line = d === today ? nowOffset(now, d, timeZone, hours) : null;
            const laid = lanes(perDay.get(d) ?? []);
            return (
              <div key={d} role="list" aria-label={`${p.weekday}, ${p.month} ${p.day}`} className="relative border-l border-[var(--hairline)]">
                {rows.map((h, i) => (
                  <span key={h} aria-hidden className="absolute inset-x-0 border-t border-[var(--hairline)]" style={{ top: i * HOUR_PX }} />
                ))}
                {laid.map(({ item: m, lane, of }) => {
                  const box = blockBox(m, d, timeZone, hours);
                  if (!box) return null;
                  // 40 minutes and up: the time fits under the label; an hour and up: the label gets two lines.
                  const tall = box.minutes >= 40;
                  const twoLines = box.minutes >= 60;
                  return (
                    <div
                      key={m.id}
                      role="listitem"
                      className="absolute px-0.5"
                      style={{ top: `${box.top}%`, height: `${box.height}%`, left: `${(lane / of) * 100}%`, width: `${100 / of}%`, minHeight: 24 }}
                    >
                      <button type="button" aria-label={meetingName(m, timeZone)} onClick={() => onOpen(m.id)} className={cn(blockClass(m), "h-full min-h-6")}>
                        <span className="flex w-full min-w-0 items-start gap-1 font-medium">
                          {m.status === "done" && <Check aria-hidden size={12} className="mt-[3px] shrink-0" />}
                          <span className={cn("min-w-0", twoLines ? "line-clamp-2" : "truncate")}>
                            {KIND_LABEL[m.kind as Kind]} · {m.source_name}
                          </span>
                        </span>
                        {tall && <span className="truncate text-[var(--fg-muted)] tabular-nums">{timeRangeLabel(m, timeZone)}</span>}
                      </button>
                    </div>
                  );
                })}
                {line !== null && (
                  <div aria-hidden data-testid="now-line" className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: `${line}%` }}>
                    <span className="-ml-1 size-2 rounded-full bg-[var(--danger-fg)]" />
                    <span className="h-px flex-1 bg-[var(--danger-fg)]" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
