"use client";

// Settings controls (UI-032): the standard controls for Settings and forms.
// On/off switches, dropdown selects, radio choices and 48px pill text inputs,
// each with a plain-words label and a one-line explanation under it.
// Turning ON a switch that lets Aeon act without asking (auto-approve) asks
// first with the Confirm dialog.
// shadcn/ui patterns on Base UI (MIT), in the Caseload look. Control outlines
// use muted ink so they meet the 3:1 rule for controls.

import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Switch } from "@base-ui/react/switch";
import { Select } from "@base-ui/react/select";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Radio } from "@base-ui/react/radio";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "./confirm-dialog";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

/** In forms (compact) labels are small and fields fill their column; `hideLabel` keeps the label for screen readers only. */
export type FieldLayout = { compact?: boolean; hideLabel?: boolean };

export const LABEL_CLASS = (compact?: boolean, hide?: boolean) =>
  cn(compact ? "text-small font-medium" : "text-body font-medium", "text-[var(--fg)]", hide && "sr-only");
export const WRAP_CLASS = (compact?: boolean) => (compact ? "flex min-w-0 flex-col gap-1" : "flex flex-col gap-2 py-2");

function Text({
  id,
  label,
  description,
  htmlFor,
  compact,
  hideLabel,
}: { id?: string; label: ReactNode; description?: ReactNode; htmlFor?: string } & FieldLayout) {
  return (
    <span className={cn("flex min-w-0 flex-col gap-0.5", hideLabel && !description && "contents")}>
      <label htmlFor={htmlFor} className={LABEL_CLASS(compact, hideLabel)}>
        {label}
      </label>
      {description && (
        <span id={id} className="text-small text-[var(--fg-muted)]">
          {description}
        </span>
      )}
    </span>
  );
}

export type SettingSwitchProps = {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  /** Ask first before turning ON (for anything that lets Aeon act without asking). */
  confirmOn?: { title: string; description: ReactNode; confirmLabel: string };
};

/** A labelled on/off switch. The whole row is the touch target. */
export function SettingSwitch({ label, description, checked, onCheckedChange, disabled, confirmOn }: SettingSwitchProps) {
  const id = useId();
  const [asking, setAsking] = useState(false);

  const change = (next: boolean) => {
    if (next && confirmOn) setAsking(true);
    else onCheckedChange(next);
  };

  return (
    <div className="flex min-h-touch items-center justify-between gap-4 py-2">
      <Text label={label} description={description} htmlFor={id} id={`${id}-d`} />
      <Switch.Root
        id={id}
        checked={checked}
        onCheckedChange={change}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
        className={cn(
          "relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border-2 border-[var(--fg-muted)] bg-transparent p-0.5 transition-colors duration-150",
          "data-[checked]:border-[var(--accent-fg)] data-[checked]:bg-[var(--accent-fg)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          "before:absolute before:-inset-2 before:content-['']",
          FOCUS,
        )}
      >
        <Switch.Thumb
          className={cn(
            "block size-[18px] rounded-full bg-[var(--fg-muted)] shadow-sm transition-transform duration-150 ease-[var(--ease-soft-out)] motion-reduce:transition-none",
            "data-[checked]:translate-x-5 data-[checked]:bg-[var(--primary-fg)]",
          )}
        />
      </Switch.Root>
      {confirmOn && (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          title={confirmOn.title}
          description={confirmOn.description}
          confirmLabel={confirmOn.confirmLabel}
          onConfirm={() => onCheckedChange(true)}
        />
      )}
    </div>
  );
}

export type SettingSelectProps<V extends string> = {
  label: string;
  description?: string;
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string }[];
  disabled?: boolean;
  className?: string;
} & FieldLayout;

/** A labelled dropdown with a 48px pill trigger. */
export function SettingSelect<V extends string>({
  label,
  description,
  value,
  onValueChange,
  options,
  disabled,
  compact,
  hideLabel,
  className,
}: SettingSelectProps<V>) {
  const id = useId();
  const items = Object.fromEntries(options.map((o) => [o.value, o.label]));
  return (
    <div className={cn(WRAP_CLASS(compact), className)}>
      <Select.Root items={items} value={value} disabled={disabled} onValueChange={(v) => v !== null && onValueChange(v as V)}>
        <span className={cn("flex min-w-0 flex-col gap-0.5", hideLabel && !description && "contents")}>
          <Select.Label className={LABEL_CLASS(compact, hideLabel)}>{label}</Select.Label>
          {description && (
            <span id={`${id}-d`} className="text-small text-[var(--fg-muted)]">
              {description}
            </span>
          )}
        </span>
        <Select.Trigger
          aria-describedby={description ? `${id}-d` : undefined}
          className={cn(
            "inline-flex h-input w-full items-center justify-between gap-2 rounded-full border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] px-5 text-left text-body text-[var(--fg)] data-[popup-open]:border-[var(--accent-fg)] data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            !compact && "max-w-sm",
            FOCUS,
          )}
        >
          <Select.Value className="min-w-0 truncate" />
          <Select.Icon>
            <ChevronDown aria-hidden size={18} className="text-[var(--fg-muted)]" />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50">
            <Select.Popup className="tile min-w-[var(--anchor-width)] bg-[var(--toast-bg)]! p-1.5 outline-none">
              <Select.List className="max-h-[min(24rem,var(--available-height))] overflow-y-auto">
                {options.map((o) => (
                  <Select.Item
                    key={o.value}
                    value={o.value}
                    className="flex min-h-touch cursor-pointer items-center justify-between gap-3 rounded-[14px] px-3.5 text-body text-[var(--fg)] outline-none select-none data-[highlighted]:bg-[var(--hairline)] data-[selected]:font-semibold"
                  >
                    <Select.ItemText>{o.label}</Select.ItemText>
                    <Select.ItemIndicator>
                      <Check aria-hidden size={18} className="text-[var(--accent-fg)]" />
                    </Select.ItemIndicator>
                  </Select.Item>
                ))}
              </Select.List>
            </Select.Popup>
          </Select.Positioner>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}

export type SettingRadioProps<V extends string> = {
  label: string;
  description?: string;
  value: V;
  onValueChange: (value: V) => void;
  options: { value: V; label: string; description?: string }[];
};

/** A labelled set of radio choices, each with its own short explanation. */
export function SettingRadio<V extends string>({ label, description, value, onValueChange, options }: SettingRadioProps<V>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2 py-2">
      <span id={`${id}-l`} className="text-body font-medium text-[var(--fg)]">
        {label}
      </span>
      {description && (
        <span id={`${id}-d`} className="-mt-1.5 text-small text-[var(--fg-muted)]">
          {description}
        </span>
      )}
      <RadioGroup
        value={value}
        onValueChange={(v) => onValueChange(v as V)}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        className="flex flex-col gap-1"
      >
        {options.map((o) => (
          <label key={o.value} className="flex min-h-touch cursor-pointer items-start gap-3 rounded-[14px] px-1 py-2.5 hover:bg-[var(--hairline)]">
            <Radio.Root
              value={o.value}
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2 border-[var(--fg-muted)] data-[checked]:border-[var(--accent-fg)]",
                FOCUS,
              )}
            >
              <Radio.Indicator className="size-2.5 rounded-full bg-[var(--accent-fg)]" />
            </Radio.Root>
            <span className="flex flex-col gap-0.5">
              <span className="text-body text-[var(--fg)]">{o.label}</span>
              {o.description && <span className="text-small text-[var(--fg-muted)]">{o.description}</span>}
            </span>
          </label>
        ))}
      </RadioGroup>
    </div>
  );
}

export type TextFieldProps = Omit<ComponentProps<"input">, "id"> & {
  label: string;
  description?: string;
  error?: string;
  /** Classes for the outer wrapper (grid placement); `className` styles the input. */
  wrapClassName?: string;
} & FieldLayout;

/** A labelled 48px pill text input, with an optional error in words. */
export function TextField({ label, description, error, className, wrapClassName, compact, hideLabel, ...props }: TextFieldProps) {
  const id = useId();
  const describedBy = [description && `${id}-d`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn(WRAP_CLASS(compact), wrapClassName)}>
      <Text label={label} description={description} htmlFor={id} id={`${id}-d`} compact={compact} hideLabel={hideLabel} />
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          "h-input w-full rounded-full border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] px-5 text-body text-[var(--fg)] placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed disabled:opacity-50",
          !compact && "max-w-sm",
          "aria-invalid:border-[var(--danger-fg)]",
          FOCUS,
          className,
        )}
        {...props}
      />
      {error && (
        <span id={`${id}-e`} className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </span>
      )}
    </div>
  );
}

export type TextAreaFieldProps = Omit<ComponentProps<"textarea">, "id"> & {
  label: string;
  description?: string;
  error?: string;
  wrapClassName?: string;
} & FieldLayout;

/** A labelled multi-line box for answers longer than a line, with an optional error in words. */
export function TextAreaField({ label, description, error, className, wrapClassName, compact, hideLabel, rows = 4, ...props }: TextAreaFieldProps) {
  const id = useId();
  const describedBy = [description && `${id}-d`, error && `${id}-e`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn(WRAP_CLASS(compact), wrapClassName)}>
      <Text label={label} description={description} htmlFor={id} id={`${id}-d`} compact={compact} hideLabel={hideLabel} />
      <textarea
        id={id}
        rows={rows}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        className={cn(
          "min-h-28 w-full resize-y rounded-[20px] border border-[var(--fg-muted)] bg-[var(--chip-off-bg)] px-5 py-3.5 text-body leading-relaxed text-[var(--fg)] placeholder:text-[var(--fg-muted)] disabled:cursor-not-allowed disabled:opacity-50",
          !compact && "max-w-xl",
          "aria-invalid:border-[var(--danger-fg)]",
          FOCUS,
          className,
        )}
        {...props}
      />
      {error && (
        <span id={`${id}-e`} className="text-small font-medium text-[var(--danger-fg)]">
          {error}
        </span>
      )}
    </div>
  );
}
