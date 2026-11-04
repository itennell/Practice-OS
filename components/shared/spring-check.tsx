"use client";

// Spring Check (UI-013): the shared checkbox for checklists and check-offs.
// Original Practice-OS code (written 2026-11-04).
//
// One spring value runs from 0 (open) to 1 (checked) and may overshoot a
// little. springReadings() turns it into the box fill, the small swell on
// overshoot, the tick being drawn and the line crossing the label out. With
// reduced motion the value jumps straight to its end.

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useId, useState, type ReactNode } from "react";
import { springReadings } from "./spring-check-readings";

export type SpringCheckProps = {
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Cross the label out when checked (default on). */
  strike?: boolean;
  /** Needed when `label` is not plain text. */
  ariaLabel?: string;
  className?: string;
};

export function SpringCheck({ label, checked, defaultChecked = false, onChange, disabled = false, strike = true, ariaLabel, className = "" }: SpringCheckProps) {
  const [own, setOwn] = useState(defaultChecked);
  const on = checked ?? own;
  const still = useReducedMotion() ?? false;
  const labelId = useId();

  const t = useSpring(on ? 1 : 0, { stiffness: 520, damping: 26, mass: 0.9 });
  useEffect(() => {
    if (still) t.jump(on ? 1 : 0);
    else t.set(on ? 1 : 0);
  }, [on, still, t]);

  const fill = useTransform(t, (v) => springReadings(v).fill);
  const box = useTransform(t, (v) => springReadings(v).box);
  const tickOffset = useTransform(t, (v) => springReadings(v).tick);
  const rule = useTransform(t, (v) => springReadings(v).rule);
  const fillScale = useTransform(fill, (v) => 0.4 + 0.6 * Math.min(1, v));
  const fillOpacity = useTransform(fill, (v) => Math.min(1, v * 1.6));

  // The label dims once the cross-out is mostly drawn.
  const dim = on && strike;

  const toggle = () => {
    if (disabled) return;
    const next = !on;
    if (checked === undefined) setOwn(next);
    onChange?.(next);
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabel ? undefined : labelId}
      disabled={disabled}
      onClick={toggle}
      className={`group flex min-h-touch w-full items-center gap-3 rounded-[12px] px-1 text-left text-body text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <motion.span
        aria-hidden
        className="relative grid size-[22px] shrink-0 place-items-center rounded-[7px] border-[1.5px] border-[var(--line-strong)] bg-[var(--glass-strong)] transition-colors duration-150 group-hover:border-[var(--accent-fg)]"
        style={{ scale: box, borderColor: on ? "var(--accent-fg)" : undefined }}
      >
        <motion.span className="absolute inset-[-1.5px] rounded-[7px] bg-[var(--accent-fg)]" style={{ opacity: fillOpacity, scale: fillScale }} />
        <svg viewBox="0 0 16 16" className="relative size-[14px]" fill="none">
          <motion.path
            d="M3.4 8.4 L6.6 11.4 L12.6 4.8"
            stroke="var(--bg)"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1 1"
            style={{ strokeDashoffset: tickOffset }}
          />
        </svg>
      </motion.span>
      <span id={labelId} className={`relative min-w-0 py-2 transition-colors duration-200 motion-reduce:transition-none ${dim ? "text-[var(--fg-muted)] delay-200" : ""}`}>
        {label}
        {strike && (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute left-0 right-0 top-1/2 h-[1.5px] origin-left rounded-full bg-current"
            style={{ scaleX: rule }}
          />
        )}
      </span>
    </button>
  );
}
