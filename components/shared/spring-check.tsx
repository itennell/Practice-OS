"use client";

// Spring Check (UI-013): the checkbox for every list where things get checked
// off (deadlines, referral follow-ups, guide steps, setup checklists). A
// springy fill and check, then the label is crossed out. Not for approvals.
// Adapted from React Bits Spring Check (MIT, reactbits.dev/c/micro/spring-check):
// lucide check instead of Hugeicons, Caseload colours, a solid focus ring, a
// box outline that meets 3:1, and a crossed-out label that turns muted
// instead of fading (so it still reads at 4.5:1).

import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { animate, useMotionValue, useMotionValueEvent, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { springReadings } from "./spring-check-readings";

/** lucide "check" icon path (lucide.dev/icons/check, ISC licence). */
const CHECK_PATH = "M20 6 9 17l-5-5";

const VISUAL_DURATION = 0.2;
const BOUNCE = 0.2;
const strikeStyle = (rule: number) => ({
  backgroundImage: "linear-gradient(currentColor, currentColor)",
  backgroundPosition: "0 55%",
  backgroundSize: `${rule * 100}% 1.5px`,
});
const zeta = (b: number) => (b <= 0 ? 1 : -Math.log(b) / Math.sqrt(Math.PI ** 2 + Math.log(b) ** 2));

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

export function SpringCheck({
  label,
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  strike = true,
  ariaLabel,
  className,
}: SpringCheckProps) {
  const controlled = checked !== undefined;
  const [inner, setInner] = useState(defaultChecked);
  const on = controlled ? checked : inner;
  const reduce = useReducedMotion();

  const t = useMotionValue(on ? 1 : 0);
  const viaPointer = useRef(false);
  const instant = useRef(false);
  const rowRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLSpanElement>(null);
  const fillRef = useRef<HTMLSpanElement>(null);
  const tickRef = useRef<SVGPathElement>(null);
  const ruleRef = useRef<HTMLSpanElement>(null);

  const write = (value: number) => {
    const r = springReadings(value);
    if (fillRef.current) fillRef.current.style.transform = `scale(${r.fill})`;
    if (boxRef.current) boxRef.current.style.transform = `scale(${r.box})`;
    if (tickRef.current) tickRef.current.style.strokeDashoffset = String(r.tick);
    if (ruleRef.current && strike) Object.assign(ruleRef.current.style, strikeStyle(r.rule));
  };
  useMotionValueEvent(t, "change", write);
  useLayoutEffect(() => write(t.get()));

  useEffect(() => {
    const target = on ? 1 : 0;
    // Keyboard toggles and reduced motion jump straight to the end state.
    if (reduce || instant.current) {
      instant.current = false;
      t.jump(target);
      return;
    }
    if (t.get() === target && t.getVelocity() === 0) return;
    const controls = animate(t, target, { type: "spring", visualDuration: VISUAL_DURATION, bounce: 1 - zeta(BOUNCE) });
    return () => controls.stop();
  }, [on, reduce, t]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || disabled) return;
    viaPointer.current = true;
    if (!reduce && rowRef.current) rowRef.current.dataset.pressed = "";
  };
  const release = () => {
    if (rowRef.current) delete rowRef.current.dataset.pressed;
  };
  const cancel = () => {
    viaPointer.current = false;
    release();
  };
  const toggle = () => {
    if (disabled) return;
    instant.current = !viaPointer.current;
    viaPointer.current = false;
    const next = !on;
    if (!controlled) setInner(next);
    onChange?.(next);
  };

  const start = on ? 1 : 0;
  return (
    <button
      ref={rowRef}
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      data-checked={on ? "" : undefined}
      className={cn(
        "group relative inline-flex min-h-touch cursor-pointer touch-manipulation items-center gap-3 rounded-xl border-0 bg-transparent py-1 pr-2 text-left text-body font-medium text-[var(--fg)] select-none [-webkit-tap-highlight-color:transparent]",
        "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerUp={release}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClick={toggle}
    >
      <span className="size-[22px] flex-none rounded-[7px] transition-transform duration-150 ease-[var(--ease-soft-out)] group-data-[pressed]:scale-95 motion-reduce:transition-none">
        <span
          ref={boxRef}
          className="relative grid size-full origin-center place-items-center overflow-hidden rounded-[inherit]"
          style={{ transform: `scale(${springReadings(start).box})` }}
        >
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_2px_var(--fg-muted)] transition-shadow duration-150 [@media(hover:hover)]:group-enabled:group-hover:shadow-[inset_0_0_0_2px_var(--accent-fg)]"
          />
          <span
            ref={fillRef}
            className="absolute inset-0 origin-center rounded-[inherit] bg-[var(--primary-bg)]"
            style={{ transform: `scale(${springReadings(start).fill})` }}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="relative size-[70%] overflow-visible fill-none stroke-[var(--primary-fg)] [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:3]"
          >
            <path
              ref={tickRef}
              d={CHECK_PATH}
              pathLength={1}
              strokeDasharray={1}
              style={{ strokeDashoffset: springReadings(start).tick }}
            />
          </svg>
        </span>
      </span>
      <span className="transition-colors duration-200 group-data-[checked]:text-[var(--fg-muted)]">
        {/* The cross-out is a background line on the text itself, so a label that
            wraps gets a line through each of its rows. */}
        <span
          ref={ruleRef}
          className="bg-no-repeat [box-decoration-break:clone] [-webkit-box-decoration-break:clone]"
          style={strike ? strikeStyle(springReadings(start).rule) : undefined}
        >
          {label}
        </span>
      </span>
    </button>
  );
}
