import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// List card (calm redesign): one card with hairline-split rows instead of a grid of
// cards. A small header with an optional link, then rows of icon, title, one muted
// line and whatever sits at the end (a chip, a date, a menu).

export function ListCard({
  id,
  label,
  action,
  children,
  className,
}: {
  /** Heading id, so the section is named by its label. */
  id: string;
  label: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("w-full overflow-hidden rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]", className)}>
      <div className="flex min-h-touch items-center justify-between gap-3 px-4">
        <h2 id={id} className="text-small font-medium text-[var(--fg-muted)]">
          {label}
        </h2>
        {action}
      </div>
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

export function ListRow({
  icon,
  accent = false,
  title,
  detail,
  end,
}: {
  /** A lucide icon element, drawn in a small rounded tile. */
  icon?: ReactNode;
  /** Tints the icon tile: for the row that needs her. */
  accent?: boolean;
  title: ReactNode;
  detail?: ReactNode;
  end?: ReactNode;
}) {
  return (
    <li className="flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] px-4 py-2.5">
      {icon && (
        <span
          aria-hidden
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
            accent ? "bg-[var(--status-running-bg)] text-[var(--accent-fg)]" : "border border-[var(--line)] text-[var(--fg-muted)]",
          )}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[0.875rem] font-semibold">{title}</p>
        {detail && <p className="line-clamp-2 text-small text-[var(--fg-muted)]">{detail}</p>}
      </div>
      {end && <div className="ml-auto flex shrink-0 items-center gap-2">{end}</div>}
    </li>
  );
}
