"use client";

// Status Mark (UI-010): one small round icon for every status in the app, plus
// the pill that carries it. Original Practice-OS code (written 2026-11-04).
//
// Each status has its own shape, so the icon still reads without colour:
// waiting is a dotted ring, in progress is a turning arc (or a filling ring when
// the amount is known), done is a ticked disc, failed is a crossed disc and
// declined is a disc with a dash through it. The mark draws itself in when the
// status changes and holds still for people who ask for reduced motion.

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export type Status = "pending" | "running" | "done" | "failed" | "declined";

/** The plain word for each status, used for pills and screen readers. */
export const STATUS_WORDS: Record<Status, string> = {
  pending: "Waiting",
  running: "In progress",
  done: "Done",
  failed: "Failed",
  declined: "Declined",
};

/** Token pair (text and tint) behind each status. Declined shares the quiet "rejected" tokens. */
const TONE: Record<Status, { fg: string; bg: string }> = {
  pending: { fg: "var(--status-pending-fg)", bg: "var(--status-pending-bg)" },
  running: { fg: "var(--status-running-fg)", bg: "var(--status-running-bg)" },
  done: { fg: "var(--status-done-fg)", bg: "var(--status-done-bg)" },
  failed: { fg: "var(--status-failed-fg)", bg: "var(--status-failed-bg)" },
  declined: { fg: "var(--status-rejected-fg)", bg: "var(--status-rejected-bg)" },
};

export type StatusMarkProps = {
  status: Status;
  /** 0..1 while running, for a filling ring instead of a spinner. */
  progress?: number;
  /** Icon size: px as a number, or a CSS length like "1.25em" to scale with the text. */
  size?: number | string;
  /** Accessible name when the mark stands alone; defaults to the status word. */
  label?: string;
  /** Hide from screen readers when visible text next to it already says the status. */
  decorative?: boolean;
  className?: string;
};

// Geometry on a 20-unit grid.
const C = 10;
const R = 8;
const RING = 2 * Math.PI * R;

export function StatusMark({ status, progress, size = 16, label, decorative = false, className }: StatusMarkProps) {
  const still = useReducedMotion() ?? false;
  const known = status === "running" && typeof progress === "number" && Number.isFinite(progress);
  const amount = known ? Math.min(1, Math.max(0, progress as number)) : 0;
  const name = label ?? (known ? `${STATUS_WORDS.running}, ${Math.round(amount * 100)}%` : STATUS_WORDS[status]);
  const fg = TONE[status].fg;

  // Strokes draw in from nothing when the status changes (keyed by status below).
  // The end state is always the animate target, so reduced motion (or a late
  // switch to it after hydration) lands on the finished mark.
  const ease = [0.22, 1, 0.36, 1] as const;
  const draw = (delay = 0) => ({
    initial: still ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: still ? { duration: 0 } : { duration: 0.32, delay, ease },
  });
  const pop = {
    initial: still ? false : { scale: 0.6, opacity: 0 },
    animate: { scale: 1, opacity: 1 },
    transition: still ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 22 },
  };

  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      className={`shrink-0 ${className ?? ""}`}
      style={{ color: fg }}
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": name })}
    >
      <g key={status}>
        {status === "pending" && (
          <circle cx={C} cy={C} r={R} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeDasharray="0.1 4.1" />
        )}

        {status === "running" && (
          <>
            <circle cx={C} cy={C} r={R} stroke="currentColor" strokeOpacity={0.22} strokeWidth={2} />
            {known ? (
              <motion.circle
                cx={C}
                cy={C}
                r={R}
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeDasharray={RING}
                transform={`rotate(-90 ${C} ${C})`}
                initial={false}
                animate={{ strokeDashoffset: RING * (1 - amount) }}
                transition={still ? { duration: 0 } : { duration: 0.3, ease: "easeOut" }}
              />
            ) : (
              <g className={still ? undefined : "status-mark-turn"} style={{ transformOrigin: "10px 10px" }}>
                <path d={`M ${C} ${C - R} A ${R} ${R} 0 0 1 ${C + R} ${C}`} stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
              </g>
            )}
          </>
        )}

        {(status === "done" || status === "failed" || status === "declined") && (
          <>
            <motion.circle cx={C} cy={C} r={R + 1} fill="currentColor" style={{ transformOrigin: "10px 10px" }} {...pop} />
            {status === "done" && (
              <motion.path d="M6.2 10.4 L8.8 13 L13.9 7.4" stroke="var(--bg)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...draw(0.08)} />
            )}
            {status === "failed" && (
              <>
                <motion.path d="M7.2 7.2 L12.8 12.8" stroke="var(--bg)" strokeWidth={2} strokeLinecap="round" {...draw(0.08)} />
                <motion.path d="M12.8 7.2 L7.2 12.8" stroke="var(--bg)" strokeWidth={2} strokeLinecap="round" {...draw(0.16)} />
              </>
            )}
            {status === "declined" && <motion.path d="M6.5 10 L13.5 10" stroke="var(--bg)" strokeWidth={2} strokeLinecap="round" {...draw(0.08)} />}
          </>
        )}
      </g>
    </svg>
  );
}

/** A status as a small tinted pill: the mark and its word (or your own words). */
export function StatusPill({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  const tone = TONE[status];
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full pl-2 pr-3 text-small font-medium ${className ?? ""}`}
      style={{ color: tone.fg, background: tone.bg }}
    >
      <StatusMark status={status} size={14} decorative />
      <span>{children ?? STATUS_WORDS[status]}</span>
    </span>
  );
}
