"use client";

// Filter menu (UI-039): a square block button (label, what is picked, a chevron) that
// opens a dropdown of options, single or multi select. For filter and sort bars over a
// table (Referrals › Partners). Square on purpose: round pills are chips and buttons.
// Base UI Menu (radio items for single, checkbox items for multi): arrow keys move,
// Enter or Space picks, Escape closes. 44px touch target.
// `filterButtonClass` gives a plain toggle button (aria-pressed) the same look.

import { Menu } from "@base-ui/react/menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type FilterOption<T extends string = string> = { value: T; label: string; count?: number };

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export const filterButtonClass = (on = false, className = "") =>
  cn(
    "inline-flex h-touch shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] border px-3 text-small font-medium whitespace-nowrap transition-colors duration-150 select-none",
    on
      ? "border-[var(--fg)] bg-[var(--glass)] text-[var(--fg)]"
      : "border-[var(--line)] bg-[var(--glass)] text-[var(--fg)] hover:border-[var(--fg-muted)] data-[popup-open]:border-[var(--fg-muted)]",
    FOCUS,
    className,
  );

const ITEM =
  "group grid min-h-touch cursor-pointer grid-cols-[1.25rem_1fr_auto] items-center gap-2 rounded-[10px] px-2.5 text-body text-[var(--fg)] outline-none select-none data-[highlighted]:bg-[var(--hairline)]";

type Common<T extends string> = {
  /** The button's name: "Kind", "Stage", "Sort". */
  label: string;
  options: FilterOption<T>[];
  className?: string;
  /** Which side of the button the list lines up with. */
  align?: "start" | "end";
};

type Single<T extends string> = Common<T> & { multiple?: false; value: T; onChange: (value: T) => void; /** The option that means "no filter": the button shows only its label then. */ allValue?: T };
type Multi<T extends string> = Common<T> & { multiple: true; value: T[]; onChange: (value: T[]) => void };

function summary<T extends string>(p: Single<T> | Multi<T>): string | null {
  if (p.multiple) {
    if (p.value.length === 0) return null;
    if (p.value.length === 1) return p.options.find((o) => o.value === p.value[0])?.label ?? null;
    return `${p.value.length} picked`;
  }
  if (p.allValue !== undefined && p.value === p.allValue) return null;
  return p.options.find((o) => o.value === p.value)?.label ?? null;
}

export function FilterMenu<T extends string>(props: Single<T> | Multi<T>) {
  const picked = summary(props);
  const active = picked !== null;
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label={picked ? `${props.label}: ${picked}` : props.label}
        className={filterButtonClass(active, props.className)}
      >
        <span className={active ? "text-[var(--fg-muted)]" : undefined}>{props.label}</span>
        {picked && <span className="max-w-[10rem] truncate font-semibold">{picked}</span>}
        <ChevronDown aria-hidden size={16} className="text-[var(--fg-muted)]" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align={props.align ?? "start"} className="z-50 outline-none">
          <Menu.Popup className="tile max-h-[min(24rem,var(--available-height))] min-w-[max(var(--anchor-width),13rem)] overflow-y-auto bg-[var(--toast-bg)]! p-1.5 outline-none">
            {props.multiple ? (
              <Menu.Group>
                <Menu.GroupLabel className="px-2.5 pt-1 pb-1.5 text-label font-semibold text-[var(--fg-muted)]">{props.label}</Menu.GroupLabel>
                {props.options.map((o) => {
                  const on = props.value.includes(o.value);
                  return (
                    <Menu.CheckboxItem
                      key={o.value}
                      checked={on}
                      closeOnClick={false}
                      onCheckedChange={(next) => props.onChange(next ? [...props.value, o.value] : props.value.filter((v) => v !== o.value))}
                      className={ITEM}
                    >
                      <span className="col-start-1 flex size-5 items-center justify-center rounded-[5px] border border-[var(--fg-muted)] group-data-[checked]:border-[var(--primary-bg)] group-data-[checked]:bg-[var(--primary-bg)] group-data-[checked]:text-[var(--primary-fg)]">
                        <Menu.CheckboxItemIndicator>
                          <Check aria-hidden size={14} />
                        </Menu.CheckboxItemIndicator>
                      </span>
                      <span className="col-start-2">{o.label}</span>
                      {o.count !== undefined && <span className="col-start-3 text-small text-[var(--fg-muted)]">{o.count}</span>}
                    </Menu.CheckboxItem>
                  );
                })}
                {props.value.length > 0 && (
                  <>
                    <Menu.Separator className="mx-1 my-1 h-px bg-[var(--hairline)]" />
                    <Menu.Item onClick={() => props.onChange([])} className={ITEM}>
                      <span className="col-start-2 text-[var(--link)]">Clear</span>
                    </Menu.Item>
                  </>
                )}
              </Menu.Group>
            ) : (
              <Menu.RadioGroup value={props.value} onValueChange={(v) => props.onChange(v as T)}>
                <Menu.GroupLabel className="px-2.5 pt-1 pb-1.5 text-label font-semibold text-[var(--fg-muted)]">{props.label}</Menu.GroupLabel>
                {props.options.map((o) => (
                  <Menu.RadioItem key={o.value} value={o.value} closeOnClick className={ITEM}>
                    <span className="col-start-1 flex items-center justify-center">
                      <Menu.RadioItemIndicator>
                        <Check aria-hidden size={16} className="text-[var(--accent-fg)]" />
                      </Menu.RadioItemIndicator>
                    </span>
                    <span className="col-start-2">{o.label}</span>
                    {o.count !== undefined && <span className="col-start-3 text-small text-[var(--fg-muted)]">{o.count}</span>}
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
