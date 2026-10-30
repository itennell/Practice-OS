import type { ReactNode } from "react";
import { GlassCard } from "@/components/ui";
import { StatusPill } from "@/components/shared/status-mark";

// The shared look of every card on Settings › Connections, so each helper's
// card (Muse, Google, Instagram, phone, Cal.com) lines up the same way:
// icon and name, one plain sentence, connected status, then its actions.

export function ConnectionCardFrame({
  icon,
  title,
  description,
  connected,
  accountLabel,
  statusText = "Not connected",
  children,
}: {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  connected: boolean;
  /** "dana@example.com", "@practiceos_", "Key ending 4f2a". */
  accountLabel?: string;
  /** What shows instead of "Not connected" (a card that needs no connection says so). */
  statusText?: string;
  /** Buttons and anything else the card needs. */
  children?: ReactNode;
}) {
  const headingId = `connection-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    // @container: the card lays itself out by its own width, not the window's. On Front Desk
    // it sits in a two-column grid, so a wide window can still mean a narrow card.
    <GlassCard aria-labelledby={headingId} className="@container flex flex-col gap-4 p-6 md:p-7">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-4 gap-y-3 @4xl:grid-cols-[auto_minmax(0,1fr)_auto]">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-[var(--chip-off-bg)] text-[var(--fg)]">
          {icon}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={headingId} className="text-section font-semibold [overflow-wrap:anywhere]">
            {title}
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">{description}</p>
        </div>
        {/* A narrow card puts the status on its own row under the title, so the text keeps its
            width. Only a wide card sets it beside the title, capped so a long label wraps. */}
        <div className="col-start-2 flex min-w-0 @4xl:col-start-3 @4xl:max-w-[16rem] @4xl:justify-end">
          {connected ? (
            <StatusPill status="done" className="h-auto min-h-7 max-w-full shrink py-1 [overflow-wrap:anywhere]">
              {accountLabel ? `Connected · ${accountLabel}` : "Connected"}
            </StatusPill>
          ) : (
            <span className="text-small text-[var(--fg-muted)]">{statusText}</span>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </GlassCard>
  );
}
