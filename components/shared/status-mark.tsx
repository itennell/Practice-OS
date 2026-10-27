"use client";

// Status Mark (UI-010): a small icon that morphs from a dashed ring (waiting)
// to a spinning arc (running), then a check (done), an X (failed) or a cross
// (declined). Use it wherever something has a status: approvals, approval
// cards in chat, the Front Desk queue, toasts.
// Adapted from React Bits Status Mark (MIT, reactbits.dev/c/micro/status-mark):
// recoloured to the Caseload status tokens, our status words, and a pill.

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export type Status = "pending" | "running" | "done" | "failed" | "declined";

/** Spoken status words. The visible label can be more specific ("Waiting for you"). */
export const STATUS_WORDS: Record<Status, string> = {
  pending: "Waiting",
  running: "In progress",
  done: "Done",
  failed: "Failed",
  declined: "Declined",
};

/** Colour tokens per status in app/globals.css (declined uses the "rejected" pair). */
const TONE: Record<Status, string> = {
  pending: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  declined: "rejected",
};

const SPRING = { type: "spring" as const, duration: 0.3, bounce: 0 };
const MORPH = { duration: 0.3, ease: [0.77, 0, 0.175, 1] as [number, number, number, number] };
const CHECK = "M7.5 12.25 10.5 15.25 16.75 8.75";
const CROSS = "M8.5 8.5 15.5 15.5M15.5 8.5 8.5 15.5";
const IDLE_DASH = 0.3;
const DASHES = 8;
const ARC = 0.68;
const SPIN_MS = 1100;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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

export function StatusMark({ status, progress, size = 16, label, decorative = false, className }: StatusMarkProps) {
  const reduce = useReducedMotion();
  const stroke = 2;
  const r = 10 - stroke / 2;
  const C = 2 * Math.PI * r;
  const P = C / DASHES;
  const determinate = status === "running" && typeof progress === "number" && Number.isFinite(progress);
  const indeterminate = status === "running" && !determinate;
  const solid = status === "running" || status === "done" || status === "failed";
  const targetArc = indeterminate ? ARC : determinate ? clamp01(progress as number) : 1;

  const mode = useMotionValue(solid ? 1 : 0);
  const arc = useMotionValue(targetArc);
  const travel = useMotionValue(0);
  const ringRef = useRef<SVGCircleElement>(null);
  const geo = useRef({ C, P });
  const gen = useRef(0);

  useLayoutEffect(() => {
    geo.current = { C, P };
    const writeDash = () => {
      const g = geo.current;
      const m = mode.get();
      const a = arc.get();
      const dash = IDLE_DASH * g.P + (a * g.C - IDLE_DASH * g.P) * m;
      const gap = (1 - IDLE_DASH) * g.P + ((1 - a) * g.C - (1 - IDLE_DASH) * g.P) * m;
      ringRef.current?.setAttribute("stroke-dasharray", `${Math.max(0, dash)} ${Math.max(0, gap)}`);
    };
    writeDash();
    ringRef.current?.setAttribute("stroke-dashoffset", String(travel.get()));
    const offs = [
      mode.on("change", writeDash),
      arc.on("change", writeDash),
      travel.on("change", (v: number) => ringRef.current?.setAttribute("stroke-dashoffset", String(v))),
    ];
    return () => offs.forEach((off) => off());
  }, [C, P, mode, arc, travel]);

  useEffect(
    () => () => {
      mode.stop();
      arc.stop();
      travel.stop();
    },
    [mode, arc, travel],
  );

  useEffect(() => {
    const g = ++gen.current;
    if (reduce) {
      mode.jump(solid ? 1 : 0);
      arc.jump(targetArc);
      travel.jump(0);
      return;
    }
    if (mode.get() === 0) arc.jump(targetArc);
    animate(mode, solid ? 1 : 0, MORPH);
    animate(arc, targetArc, SPRING);
    if (indeterminate) {
      const t0 = travel.get();
      animate(travel, [t0, t0 - C], { duration: SPIN_MS / 1000, ease: "linear", repeat: Infinity });
      return;
    }
    const unit = determinate ? C : P;
    const to = Math.floor(travel.get() / unit) * unit;
    animate(travel, to, SPRING).then(() => {
      if (gen.current === g) travel.jump(0);
    });
  }, [status, solid, determinate, indeterminate, targetArc, reduce, C, P, mode, arc, travel]);

  const spoken =
    label ?? STATUS_WORDS[status] + (determinate ? `, ${Math.round(clamp01(progress as number) * 100)}%` : "");

  return (
    <svg
      className={cn("group shrink-0 overflow-visible", className)}
      data-status={status}
      data-indeterminate={indeterminate ? "" : undefined}
      style={{ color: `var(--status-${TONE[status]}-fg)`, transition: "color 200ms ease" }}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : spoken}
      aria-hidden={decorative || undefined}
    >
      <circle
        className="fill-current stroke-current [fill-opacity:0] [stroke-opacity:0] [transition:fill-opacity_180ms_ease,stroke-opacity_200ms_ease] group-data-[status=done]:[fill-opacity:0.1] group-data-[status=failed]:[fill-opacity:0.1] group-data-[status=running]:[stroke-opacity:0.2]"
        strokeWidth={stroke}
        cx="12"
        cy="12"
        r={r}
        transform="rotate(-90 12 12)"
      />
      <circle
        ref={ringRef}
        className="fill-none stroke-current opacity-60 [stroke-linecap:round] [transition:opacity_200ms_ease] group-data-[status=done]:opacity-100 group-data-[status=failed]:opacity-100 group-data-[status=running]:opacity-100 motion-reduce:group-data-[indeterminate]:animate-pulse"
        strokeWidth={stroke}
        cx="12"
        cy="12"
        r={r}
        transform="rotate(-90 12 12)"
      />
      <path
        className="fill-none stroke-current opacity-0 [stroke-dasharray:1_2] [stroke-dashoffset:1.05] [stroke-linecap:round] [stroke-linejoin:round] [transition:stroke-dashoffset_160ms_var(--ease-soft-out),opacity_0ms_linear_160ms] group-data-[status=done]:opacity-100 group-data-[status=done]:[stroke-dashoffset:0] group-data-[status=done]:[transition:stroke-dashoffset_240ms_var(--ease-soft-out)_120ms,opacity_0ms_linear_120ms] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-opacity"
        strokeWidth={stroke}
        d={CHECK}
        pathLength="1"
      />
      <path
        className="fill-none stroke-current opacity-0 [stroke-dasharray:1_2] [stroke-dashoffset:1.05] [stroke-linecap:round] [stroke-linejoin:round] [transition:stroke-dashoffset_160ms_var(--ease-soft-out),opacity_0ms_linear_160ms] group-data-[status=declined]:opacity-100 group-data-[status=declined]:[stroke-dashoffset:0] group-data-[status=failed]:opacity-100 group-data-[status=failed]:[stroke-dashoffset:0] group-data-[status=declined]:[transition:stroke-dashoffset_240ms_var(--ease-soft-out)_120ms,opacity_0ms_linear_120ms] group-data-[status=failed]:[transition:stroke-dashoffset_240ms_var(--ease-soft-out)_120ms,opacity_0ms_linear_120ms] motion-reduce:[stroke-dashoffset:0] motion-reduce:transition-opacity"
        strokeWidth={stroke}
        d={CROSS}
        pathLength="1"
      />
    </svg>
  );
}

/** The status pill: tinted ground, Status Mark and a visible label in the status colour. */
export function StatusPill({ status, children, className }: { status: Status; children?: ReactNode; className?: string }) {
  const tone = TONE[status];
  return (
    <span
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2 text-small font-semibold", className)}
      style={{ color: `var(--status-${tone}-fg)`, background: `var(--status-${tone}-bg)` }}
    >
      <StatusMark status={status} decorative />
      {children ?? STATUS_WORDS[status]}
    </span>
  );
}
