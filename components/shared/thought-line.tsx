"use client";

// Thought Line (UI-014): the line that says what Aeon is doing right now, with
// an optional list of real tasks under it. Original Practice-OS code (written
// 2026-11-04).
//
// While working: a small breathing orb, the label with a slow glint moving
// through it, and a running timer. When the work ends the line settles into
// what happened ("Drafted 3 posts", or "Done in 4.2s") and, by default, folds
// its task list away; the list can be opened again. Screen readers hear the
// label and the result through a polite status region.

import { ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { StatusMark } from "./status-mark";
import { STEP_WORDS, normalizeSteps, type ThoughtStep } from "./thought-line-steps";
import { formatTenths, spokenTenths } from "./thought-line-time";

export type ThoughtLineProps = {
  /** Aeon is still working. */
  working: boolean;
  /** While working. */
  label?: string;
  /** When done, what happened: "Drafted 3 posts". Defaults to "Done in 4.2s". */
  doneLabel?: string;
  /**
   * Real progress, oldest first, one short line each (five to seven words at
   * most: "Drafted 3 posts"). Plain strings: all done except the last, which
   * is in progress. Or tasks with their own status (planned ones as "pending").
   */
  steps?: (string | ThoughtStep)[];
  showTimer?: boolean;
  /** Fold the steps away when done (they can be opened again). */
  collapseOnSettle?: boolean;
  onSettle?: (seconds: number) => void;
  className?: string;
};

/** Tenths of a second since `working` last turned on, ticking while it stays on. */
function useWorkClock(working: boolean, onSettle?: (seconds: number) => void) {
  const [tenths, setTenths] = useState(0);
  const finished = useRef<number | null>(null);
  const settleRef = useRef(onSettle);
  useEffect(() => {
    settleRef.current = onSettle;
  });

  useEffect(() => {
    if (!working) return;
    const begin = performance.now();
    const read = () => Math.floor((performance.now() - begin) / 100);
    const id = window.setInterval(() => setTenths(read()), 100);
    return () => {
      window.clearInterval(id);
      finished.current = read();
      setTenths(finished.current);
    };
  }, [working]);

  // Runs after the clock above has stopped, so it reports the final time once.
  useEffect(() => {
    if (working || finished.current === null) return;
    const final = finished.current;
    finished.current = null;
    settleRef.current?.(final / 10);
  }, [working]);

  return tenths;
}

export function ThoughtLine({
  working,
  label = "Thinking…",
  doneLabel,
  steps = [],
  showTimer = true,
  collapseOnSettle = true,
  onSettle,
  className = "",
}: ThoughtLineProps) {
  const tenths = useWorkClock(working, onSettle);
  const tasks = normalizeSteps(steps, working);
  const hasTasks = tasks.length > 0;
  const boxId = useId();

  // Open while working; on settle fold away if asked. A line that is already
  // settled when it first shows starts folded the same way.
  const [open, setOpen] = useState(working || !collapseOnSettle);
  const [seen, setSeen] = useState(working);
  if (seen !== working) {
    setSeen(working);
    if (working) setOpen(true);
    else if (collapseOnSettle) setOpen(false);
  }

  const ranAtAll = tenths > 0;
  const settledText = doneLabel ?? (ranAtAll ? `Done in ${formatTenths(tenths)}` : "Done");
  const headline = working ? label : settledText;
  const spoken = working ? label : doneLabel ?? (ranAtAll ? `Done in ${spokenTenths(tenths)}` : "Done");

  const glyph = working ? (
    <span aria-hidden className="orb size-3.5 shrink-0" />
  ) : (
    <StatusMark status={tasks.some((t) => t.status === "failed") ? "failed" : "done"} size={16} decorative />
  );

  const timer = showTimer && (working || ranAtAll) && (
    <span aria-hidden className="ml-1 shrink-0 tabular-nums text-small text-[var(--fg-muted)]">
      {formatTenths(tenths)}
    </span>
  );

  const words = <span className={`min-w-0 ${working ? "working-glint" : "text-[var(--fg)]"}`}>{headline}</span>;

  return (
    <div className={`flex flex-col text-body ${className}`}>
      <span role="status" className="sr-only">
        {spoken}
      </span>

      {hasTasks ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={boxId}
          onClick={() => setOpen((o) => !o)}
          className="-mx-2 flex min-h-touch items-center gap-2.5 self-start rounded-full px-2 text-left hover:bg-[var(--chip-off-bg)]"
        >
          {glyph}
          {words}
          {timer}
          <span className="sr-only">{open ? ", Hide steps" : ", Show steps"}</span>
          <ChevronDown
            aria-hidden
            size={16}
            className={`shrink-0 text-[var(--fg-muted)] transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        </button>
      ) : (
        <p className="flex min-h-touch items-center gap-2.5">
          {glyph}
          {words}
          {timer}
        </p>
      )}

      {hasTasks && (
        <div
          id={boxId}
          className="grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? "1fr" : "0fr", visibility: open ? "visible" : "hidden" }}
        >
          <div className="min-h-0 overflow-hidden">
            <ol className="ml-[7px] flex flex-col gap-1.5 border-l border-[var(--hairline)] py-1 pl-4">
              {tasks.map((t, i) => (
                <li
                  key={`${i}-${t.label}`}
                  className={`flex items-center gap-2 text-small ${t.status === "pending" ? "text-[var(--fg-muted)]" : t.status === "failed" ? "text-[var(--status-failed-fg)]" : "text-[var(--fg)]"}`}
                >
                  <StatusMark status={t.status} size={14} decorative />
                  <span className={t.status === "running" ? "working-glint" : undefined}>
                    {t.label}
                    <span className="sr-only">, {STEP_WORDS[t.status]}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
