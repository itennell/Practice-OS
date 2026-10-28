"use client";

// Date field: the shared way to pick a date in a form. A 48px pill you can type
// into (11/25/2026) with a calendar button that opens the shared Calendar
// (UI-030) in a popover. The value is always an ISO day ("2026-11-25") or "".

import { useId, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "./calendar";
import { formatTyped, fromIso, parseTyped, toIso } from "./date-field-parse";
import { LABEL_CLASS, WRAP_CLASS, type FieldLayout } from "./settings-controls";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export type DateFieldProps = {
  label: string;
  /** ISO day ("2026-11-25") or "" for none. */
  value: string;
  onChange: (iso: string) => void;
  description?: string;
  /** Earliest and latest ISO days allowed. */
  min?: string;
  max?: string;
  required?: boolean;
  /** Show a small button that empties the field. */
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
} & FieldLayout;

export function DateField({
  label,
  value,
  onChange,
  description,
  min,
  max,
  required,
  clearable,
  disabled,
  compact = true,
  hideLabel,
  className,
}: DateFieldProps) {
  const id = useId();
  const [text, setText] = useState(formatTyped(value));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  // Follow the value when it changes from outside (a reset, Aeon filling it in).
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    if ((parseTyped(text) ?? "") !== value) setText(formatTyped(value));
  }

  const inRange = (iso: string) => (!min || iso >= min) && (!max || iso <= max);

  const type = (next: string) => {
    setText(next);
    setError("");
    if (!next.trim()) return onChange("");
    const iso = parseTyped(next);
    if (iso && inRange(iso)) onChange(iso);
  };

  const blur = () => {
    if (!text.trim()) return setError(required ? "Pick a date." : "");
    const iso = parseTyped(text);
    if (!iso) return setError("Type a date like 11/25/2026, or pick one.");
    if (!inRange(iso)) return setError(min && iso < min ? `Pick ${formatTyped(min)} or later.` : `Pick ${formatTyped(max!)} or earlier.`);
    setText(formatTyped(iso));
  };

  const pick = (d: Date | undefined) => {
    if (!d) return;
    const iso = toIso(d);
    onChange(iso);
    setText(formatTyped(iso));
    setError("");
    setOpen(false);
  };

  const describedBy = [description && `${id}-d`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  const selected = value ? fromIso(value) : undefined;
  const disabledDays = [...(min ? [{ before: fromIso(min) }] : []), ...(max ? [{ after: fromIso(max) }] : [])];

  return (
    <div className={cn(WRAP_CLASS(compact), className)}>
      <label htmlFor={id} className={LABEL_CLASS(compact, hideLabel)}>
        {label}
      </label>
      {description && (
        <span id={`${id}-d`} className="text-small text-[var(--fg-muted)]">
          {description}
        </span>
      )}
      <div
        className={cn(
          "flex h-input w-full items-center rounded-full border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] pr-1 pl-5 focus-within:border-[var(--accent-fg)]",
          error && "border-[var(--danger-fg)]",
          disabled && "opacity-50",
          !compact && "max-w-sm",
        )}
      >
        <input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/DD/YYYY"
          value={text}
          required={required}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          onChange={(e) => type(e.target.value)}
          onBlur={blur}
          className="h-full min-w-0 flex-1 bg-transparent text-body text-[var(--fg)] tabular-nums outline-none placeholder:text-[var(--fg-muted)]"
        />
        {clearable && value && !disabled && (
          <button
            type="button"
            onClick={() => type("")}
            aria-label={`Clear ${label}`}
            className={cn("inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)]", FOCUS)}
          >
            <X aria-hidden size={16} />
          </button>
        )}
        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            disabled={disabled}
            aria-label={`Pick ${label} from a calendar`}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--fg-muted)] hover:bg-[var(--hairline)] hover:text-[var(--fg)] data-[popup-open]:text-[var(--accent-fg)]",
              FOCUS,
            )}
          >
            <CalendarDays aria-hidden size={18} />
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner sideOffset={8} align="end" className="z-50">
              <Popover.Popup aria-label={label} className="tile bg-[var(--toast-bg)]! p-3 outline-none">
                <Calendar selected={selected} onSelect={pick} defaultMonth={selected ?? (min ? fromIso(min) : undefined)} disabled={disabledDays} />
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {error && (
        <span id={`${id}-e`} className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </span>
      )}
    </div>
  );
}
