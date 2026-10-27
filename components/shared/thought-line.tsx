"use client";

// Thought Line (UI-014): shown while Aeon works through something the
// clinician should see: a shimmering "Thinking…" line with tiny chrome Aeon
// droplets dancing beside it, a timer, and an expandable list of steps; it settles into a done
// label ("Drafted 3 posts") and folds the steps away.
// Steps must be plain-English summaries of real work from actual job
// progress: never raw model reasoning, never invented progress.
// Use Status Mark for item status and Thought Line for Aeon's own work.
// Adapted from React Bits Thought Line (MIT, reactbits.dev/c/micro/thought-line):
// chrome Aeon droplets as the glyph, lucide icons, Caseload colours, finished steps turn muted
// instead of fading (so they keep 4.5:1), a 44px toggle with a focus ring.

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AeonDroplets } from "./aeon-droplets";
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
   * Real progress, in plain words, oldest first. Plain strings: all done except
   * the last, which is in progress. Or tasks with their own status (planned
   * ones as "pending") and a short detail line of what Aeon found or did.
   */
  steps?: (string | ThoughtStep)[];
  showTimer?: boolean;
  /** Fold the steps away when done (they can be opened again). */
  collapseOnSettle?: boolean;
  onSettle?: (seconds: number) => void;
  className?: string;
};

export function ThoughtLine({
  working,
  label = "Thinking…",
  doneLabel,
  steps = [],
  showTimer = true,
  collapseOnSettle = true,
  onSettle,
  className,
}: ThoughtLineProps) {
  const [open, setOpen] = useState(true);
  const [tenths, setTenths] = useState(0);
  const startedAt = useRef(0);
  const listId = useId();
  const hasSteps = steps.length > 0;
  const settleRef = useRef(onSettle);
  useEffect(() => {
    settleRef.current = onSettle;
  });

  // When work starts: reset the timer and open the steps. When it ends: fold them.
  // (Adjusted during render, as React recommends, rather than in an effect.)
  const [prevWorking, setPrevWorking] = useState(working);
  if (working !== prevWorking) {
    setPrevWorking(working);
    if (working) {
      setTenths(0);
      setOpen(true);
    } else if (collapseOnSettle) {
      setOpen(false);
    }
  }

  // The timer ticks only while working; the last tick is the final time.
  useEffect(() => {
    if (!working) return;
    startedAt.current = performance.now();
    const id = setInterval(() => setTenths(Math.floor((performance.now() - startedAt.current) / 100)), 100);
    return () => clearInterval(id);
  }, [working]);

  const settledOnce = useRef(working);
  useEffect(() => {
    if (settledOnce.current && !working) settleRef.current?.(Math.floor((performance.now() - startedAt.current) / 100) / 10);
    settledOnce.current = working;
  }, [working]);

  const done = doneLabel ?? (showTimer ? "Done in" : "Done");
  const announce = working ? label : showTimer && !doneLabel ? `${done} ${spokenTenths(tenths)}` : done;

  const head = (
    <>
      <AeonDroplets working={working} />
      <span
        className={cn(
          "transition-colors duration-300",
          working
            ? "thought-shimmer text-[var(--fg-muted)]"
            : "text-[var(--fg)]",
        )}
      >
        {working ? label : done}
      </span>
      {showTimer && (
        <span aria-hidden className="text-[var(--fg-muted)] tabular-nums">
          {formatTenths(tenths)}
        </span>
      )}
      {hasSteps && (
        <ChevronDown aria-hidden size="1em" className={cn("text-[var(--fg-muted)] transition-transform duration-200", open && "rotate-180")} />
      )}
    </>
  );

  return (
    <div className={cn("flex w-full max-w-xl flex-col items-start text-body font-medium [&>div[id]]:self-stretch", className)}>
      {hasSteps ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
          className="-mx-2 inline-flex min-h-touch items-center gap-[0.4em] rounded-full px-2 text-left hover:bg-[var(--hairline)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
        >
          {head}
          <span className="sr-only">{open ? " Hide steps" : " Show steps"}</span>
        </button>
      ) : (
        <div className="inline-flex min-h-touch items-center gap-[0.4em]">{head}</div>
      )}
      <span role="status" className="sr-only">
        {announce}
      </span>
      {hasSteps && (
        <div
          id={listId}
          className={cn(
            "grid transition-[grid-template-rows] duration-300 ease-[var(--ease-soft-out)] motion-reduce:transition-none",
            open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
          aria-hidden={!open}
        >
          <div className="-mx-2 min-h-0 overflow-hidden px-2 pb-4">
            {/* The task box: a raised card under the line, one row per task. */}
            <ol className="tile mt-1 divide-y divide-[var(--hairline)] px-3.5 py-1 sm:px-4">
              {normalizeSteps(steps, working).map((step, i) => (
                <li
                  key={`${i}-${step.label}`}
                  className="flex items-start gap-3 py-2.5 font-normal motion-safe:animate-[pill-open_220ms_var(--ease-soft-out)]"
                >
                  <StatusMark status={step.status} size="1.15em" decorative className="mt-[0.15em]" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={cn(
                        "text-small",
                        step.status === "pending" && "text-[var(--fg-muted)]",
                        step.status === "running" && "font-semibold text-[var(--fg)]",
                        step.status === "done" && "text-[var(--fg)]",
                        step.status === "failed" && "font-medium text-[var(--danger-fg)]",
                      )}
                    >
                      {step.label}
                      <span className="sr-only">, {STEP_WORDS[step.status]}</span>
                    </span>
                    {step.detail && <span className="text-label text-[var(--fg-muted)]">{step.detail}</span>}
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
