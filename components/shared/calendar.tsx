"use client";

// Calendar (UI-030): one month calendar for everywhere dates matter, so dates
// look the same across the app: Deadlines (dots on due days), the Front Desk
// schedule panel (booked consults), the Instagram content calendar, and as a
// date picker in forms. Weeks start on Sunday.
// Built on shadcn/ui's Calendar pattern over react-day-picker (MIT). coss ui
// was the visual reference only (AGPL, no code taken). Put it inside a glass card.

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { DayPicker, type DayButtonProps } from "react-day-picker";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { dayKey, dayLabel, groupByDay, type CalendarEvent, type CalendarEventKind } from "./calendar-labels";

export type { CalendarEvent, CalendarEventKind };

/** Dot colours: deadline amber, consult accent, post pink, done green. */
const DOT: Record<CalendarEventKind, string> = {
  deadline: "var(--event-deadline)",
  consult: "var(--event-consult)",
  post: "var(--event-post)",
  done: "var(--event-done)",
};

const EventsByDay = createContext<Map<string, CalendarEvent[]>>(new Map());

/** One day: its number, up to three event dots, and a label that says what is due. */
function DayWithDots({ day, modifiers, className: cls, ...props }: DayButtonProps) {
  const byDay = useContext(EventsByDay);
  // react-day-picker moves keyboard focus by marking a day "focused"; the button must take it.
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);
  const list = byDay.get(dayKey(day.date)) ?? [];
  const kinds = [...new Set(list.map((e) => e.kind))].slice(0, 3);
  return (
    <button
      ref={ref}
      {...props}
      aria-label={dayLabel(day.date, list, {
        today: modifiers.today,
        selected: modifiers.selected,
      })}
      className={cn(
        cls,
        "relative inline-flex size-11 flex-col items-center justify-center rounded-full text-body font-medium tabular-nums transition-colors duration-150 sm:size-10",
        "hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
        modifiers.outside && "text-[var(--fg-muted)]",
        modifiers.today &&
          !modifiers.selected &&
          "font-semibold text-[var(--accent-fg)] shadow-[inset_0_0_0_2px_var(--accent-fg)]",
        modifiers.selected && "bg-[var(--primary-bg)] font-semibold text-[var(--primary-fg)] hover:bg-[var(--primary-hover)]",
        modifiers.disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span>{day.date.getDate()}</span>
      {kinds.length > 0 && (
        <span aria-hidden className="absolute bottom-1 flex gap-0.5">
          {kinds.map((k) => (
            <span
              key={k}
              className="size-1.5 rounded-full"
              style={{
                background: modifiers.selected ? "var(--primary-fg)" : DOT[k],
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}

export type CalendarProps = {
  events?: CalendarEvent[];
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
  /** Month shown (controlled). Leave out to start on `defaultMonth` or today. */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  defaultMonth?: Date;
  /** For fixed screenshots and tests; defaults to the real today. */
  today?: Date;
  className?: string;
};

export function Calendar({
  events = [],
  selected,
  onSelect,
  month,
  onMonthChange,
  defaultMonth,
  today,
  className,
}: CalendarProps) {
  const byDay = useMemo(() => groupByDay(events), [events]);

  return (
    <EventsByDay.Provider value={byDay}>
      <DayPicker
        mode="single"
        required={false}
        selected={selected}
        onSelect={onSelect}
        month={month}
        onMonthChange={onMonthChange}
        defaultMonth={defaultMonth ?? selected}
        today={today}
        weekStartsOn={0}
        showOutsideDays
        fixedWeeks
        className={cn("w-fit text-[var(--fg)]", className)}
        classNames={{
          months: "relative flex flex-col",
          month: "flex flex-col gap-3",
          nav: "absolute inset-x-0 top-0 flex items-center justify-between",
          button_previous:
            "inline-flex size-11 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--hairline)] aria-disabled:opacity-50 sm:size-10",
          button_next:
            "inline-flex size-11 items-center justify-center rounded-full text-[var(--fg)] hover:bg-[var(--hairline)] aria-disabled:opacity-50 sm:size-10",
          month_caption: "flex h-11 items-center justify-center px-12 sm:h-10",
          caption_label: "text-body font-semibold",
          month_grid: "border-collapse",
          
          weekday: "h-11 w-11 p-0 text-center align-middle text-label font-semibold text-[var(--fg-muted)] sm:h-8 sm:w-10",
          
          // Plain table layout on purpose: flex on rows or headers drops their table roles for screen readers.
        day: "p-0 text-center align-middle",
          hidden: "invisible",
        }}
        components={{
          Chevron: ({ orientation }) =>
            orientation === "left" ? <ChevronLeft aria-hidden size={20} /> : <ChevronRight aria-hidden size={20} />,
          DayButton: DayWithDots,
        }}
      />
    </EventsByDay.Provider>
  );
}
