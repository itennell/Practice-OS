"use client";

// Slider (UI-037): pick a number by dragging a thumb or with the arrow keys,
// with the value shown beside the label ("Posts: 3"). shadcn/ui's Slider
// pattern on Base UI (MIT), in the Caseload look. The thumb is a 28px circle in
// a 44px touch area; the filled part of the track uses the accent.

import { Slider as SliderPrimitive } from "@base-ui/react/slider";
import { cn } from "@/lib/utils";
import { LABEL_CLASS } from "./settings-controls";

export type SliderProps = {
  label: string;
  /** Words for the number, e.g. (n) => `${n} posts`; read out and shown beside the label. */
  valueText?: (value: number) => string;
  value: number;
  onValueChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
};

export function Slider({ label, valueText, value, onValueChange, min, max, step = 1, disabled, compact, className }: SliderProps) {
  const words = valueText ? valueText(value) : String(value);
  return (
    <SliderPrimitive.Root
      value={value}
      onValueChange={(v) => onValueChange(Array.isArray(v) ? v[0] : v)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      className={cn("flex min-w-[160px] flex-col gap-1", disabled && "opacity-60", className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <SliderPrimitive.Label className={LABEL_CLASS(compact)}>
          {label}
        </SliderPrimitive.Label>
        <span aria-hidden className="text-small tabular-nums text-[var(--fg-muted)]">
          {words}
        </span>
      </div>
      <SliderPrimitive.Control className="flex h-touch w-full touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-1.5 w-full rounded-full bg-[var(--line-strong)]">
          <SliderPrimitive.Indicator className="rounded-full bg-[var(--accent-fg)]" />
          <SliderPrimitive.Thumb
            getAriaValueText={() => words}
            className="size-7 rounded-full border border-[var(--line-strong)] bg-[var(--glass-strong)] shadow-[0_1px_3px_rgb(31_30_29/0.18)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid"
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
