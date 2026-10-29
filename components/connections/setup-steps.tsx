"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";

// Guided setup inside a Connect card: numbered steps, one action each, each
// saying what she should see. Done steps show a check and fold to one line,
// the current one is open, later ones wait. Steps Practice-OS can check are
// checked live; the rest have a "Done" button. Used by every guided card on
// Settings › Connections and in onboarding chapter 6.

export type GuidedStep = {
  id: string;
  /** One action, in plain words: "Press Create app." */
  title: string;
  /** What she should see when it worked. */
  see?: string;
  state: "done" | "current" | "waiting";
  /** Links, copy buttons or a paste box for the current step. */
  body?: ReactNode;
  /** Practice-OS can't check this one, so she presses Done. */
  onDone?: () => void;
};

export function SetupSteps({ label, steps }: { label: string; steps: GuidedStep[] }) {
  const doneCount = steps.filter((s) => s.state === "done").length;
  return (
    <section aria-label={label} className="flex basis-full flex-col gap-3">
      <p className="text-small text-[var(--fg-muted)]" aria-live="polite">
        {doneCount === steps.length ? "All steps done." : `Step ${Math.min(doneCount + 1, steps.length)} of ${steps.length}`}
      </p>
      <ol className="flex list-none flex-col gap-2">
        {steps.map((s, i) => (
          <li
            key={s.id}
            aria-current={s.state === "current" ? "step" : undefined}
            className={
              s.state === "current"
                ? "flex flex-col gap-3 rounded-[20px] border border-border bg-[var(--chip-off-bg)] p-4"
                : "flex items-start gap-3 px-4 py-2"
            }
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`grid size-7 shrink-0 place-items-center rounded-full text-small font-semibold ${
                  s.state === "done" ? "bg-[var(--status-done-bg)] text-[var(--status-done-fg)]" : "border border-border text-[var(--fg)]"
                }`}
              >
                {s.state === "done" ? <Check size={16} /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-col gap-1">
                <p className={s.state === "waiting" ? "text-[var(--fg-muted)]" : s.state === "current" ? "font-medium" : ""}>
                  <span className="sr-only">
                    Step {i + 1}, {s.state === "done" ? "done" : s.state === "current" ? "do this now" : "later"}:{" "}
                  </span>
                  {s.title}
                </p>
                {s.state === "current" && s.see && <p className="text-small text-[var(--fg-muted)]">You should see: {s.see}</p>}
              </div>
            </div>
            {s.state === "current" && (s.body || s.onDone) && (
              <div className="flex flex-col items-start gap-3 sm:pl-10">
                {s.body}
                {s.onDone && (
                  <Button variant="quiet" onClick={s.onDone}>
                    Done, next step
                  </Button>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
