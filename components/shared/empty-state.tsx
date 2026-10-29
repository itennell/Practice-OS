import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Empty state (calm redesign): a small icon tile, one bold line, one helpful
// sentence and at most one action. Used wherever a list has nothing in it yet.

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  /** A lucide icon element. */
  icon: ReactNode;
  title: string;
  /** One sentence: what will show up here, or what to do next. */
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-5 py-10 text-center", className)}>
      <span aria-hidden className="mb-1 flex size-10 items-center justify-center rounded-[var(--radius-control)] border border-[var(--line)] text-[var(--fg-muted)]">
        {icon}
      </span>
      <p className="font-semibold">{title}</p>
      {children && <p className="max-w-[40ch] text-small text-[var(--fg-muted)]">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
