"use client";

// Icon button (UI-041): a 44px square-ish button holding one lucide icon, named for
// screen readers (aria-label) and shown in words on hover or keyboard focus (Base UI
// Tooltip). For rows of quick actions (Referrals › Partners). Wrap a group of them in
// one <IconButtonGroup> so the tooltips share a delay. A disabled button still says
// why (`reason`): read to screen readers through aria-describedby, and shown in the
// tooltip on a wrapper (a disabled button gets no pointer events of its own).

import { Tooltip } from "@base-ui/react/tooltip";
import { forwardRef, useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const iconButtonClass = (className = "") =>
  cn(
    "inline-flex size-touch shrink-0 items-center justify-center rounded-[var(--radius-control)] text-[var(--fg-muted)] transition-colors duration-150 hover:bg-[var(--hairline)] hover:text-[var(--fg)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent data-[popup-open]:bg-[var(--hairline)] data-[popup-open]:text-[var(--fg)]",
    "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid",
    className,
  );

export function IconButtonGroup({ children }: { children: ReactNode }) {
  return <Tooltip.Provider delay={300}>{children}</Tooltip.Provider>;
}

export function TooltipPopup({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Portal>
      <Tooltip.Positioner sideOffset={6} className="z-50">
        <Tooltip.Popup className="rounded-[8px] bg-[var(--primary-bg)] px-2 py-1 text-small font-medium text-[var(--primary-fg)] shadow-[var(--tile-shadow)] transition-opacity duration-100 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
          {children}
        </Tooltip.Popup>
      </Tooltip.Positioner>
    </Tooltip.Portal>
  );
}

type Props = Omit<ComponentProps<"button">, "aria-label" | "children"> & {
  /** What the button does, in words: the accessible name and the tooltip. */
  label: string;
  icon: ReactNode;
  /** Why it is off, when disabled ("No email yet"). */
  reason?: string;
};

export const IconButton = forwardRef<HTMLButtonElement, Props>(function IconButton({ label, icon, reason, className, type = "button", ...props }, ref) {
  const reasonId = useId();
  if (props.disabled && reason) {
    return (
      <Tooltip.Root>
        <Tooltip.Trigger render={<span className="inline-flex" />}>
          <button ref={ref} type={type} aria-label={label} aria-describedby={reasonId} className={iconButtonClass(className)} {...props}>
            {icon}
          </button>
          <span id={reasonId} className="sr-only">
            {reason}
          </span>
        </Tooltip.Trigger>
        <TooltipPopup>
          {label}: {reason}
        </TooltipPopup>
      </Tooltip.Root>
    );
  }
  return (
    <Tooltip.Root>
      <Tooltip.Trigger ref={ref} type={type} aria-label={label} className={iconButtonClass(className)} {...props}>
        {icon}
      </Tooltip.Trigger>
      <TooltipPopup>{label}</TooltipPopup>
    </Tooltip.Root>
  );
});
