"use client";

// Tabs (UI-038): one row of tabs over panels, on Base UI Tabs (arrow keys move between
// tabs, Home and End jump, the panel is named by its tab). Two looks:
// - "line" (default): page tabs (Referrals: Partners, Overview, Board, …). 44px tall,
//   the current one underlined in ink; on a phone the row scrolls sideways.
// - "segmented": a small switch inside a panel (the call script's Front desk /
//   Provider / Voicemail). A hairline box with the current segment filled.
// The caller owns the value, so a page can keep it in the URL (?tab=).

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Look = "line" | "segmented";

const FOCUS = "outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-solid";

export function Tabs<T extends string>({
  value,
  onValueChange,
  children,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <BaseTabs.Root value={value} onValueChange={(v) => onValueChange(v as T)} className={cn("flex min-w-0 flex-col", className)}>
      {children}
    </BaseTabs.Root>
  );
}

export function TabList({ label, look = "line", children, className }: { label: string; look?: Look; children: ReactNode; className?: string }) {
  return (
    <BaseTabs.List
      aria-label={label}
      className={cn(
        look === "line"
          ? "-mx-4 flex min-w-0 gap-1 overflow-x-auto border-b border-[var(--hairline)] px-4 [scrollbar-width:none] md:mx-0 md:px-0"
          : "inline-flex w-full gap-1 rounded-[var(--radius-control)] border border-[var(--line)] bg-[var(--chip-off-bg)] p-1",
        className,
      )}
    >
      {children}
    </BaseTabs.List>
  );
}

export function Tab({ value, look = "line", children, className }: { value: string; look?: Look; children: ReactNode; className?: string }) {
  return (
    <BaseTabs.Tab
      value={value}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap select-none transition-colors duration-150",
        look === "line"
          ? "-mb-px h-touch border-b-2 border-transparent px-3 text-body font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] data-[active]:border-[var(--fg)] data-[active]:text-[var(--fg)]"
          : "min-h-touch flex-1 rounded-[9px] px-3 text-small font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] data-[active]:bg-[var(--glass)] data-[active]:text-[var(--fg)] data-[active]:shadow-[var(--tile-shadow)]",
        FOCUS,
        className,
      )}
    >
      {children}
    </BaseTabs.Tab>
  );
}

export function TabPanel({ value, children, className, keepMounted = false }: { value: string; children: ReactNode; className?: string; keepMounted?: boolean }) {
  return (
    <BaseTabs.Panel value={value} keepMounted={keepMounted} className={cn("min-w-0 outline-none", className)}>
      {children}
    </BaseTabs.Panel>
  );
}
