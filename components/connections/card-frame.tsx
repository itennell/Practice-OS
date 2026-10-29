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
    <GlassCard aria-labelledby={headingId} className="flex flex-col gap-4 p-6 md:p-7">
      <div className="flex flex-wrap items-start gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-2xl border border-border bg-[var(--chip-off-bg)] text-[var(--fg)]">
          {icon}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 id={headingId} className="text-section font-semibold">
            {title}
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">{description}</p>
        </div>
        {/* On phones the status gets its own line so the description keeps its width. */}
        <div className="basis-full sm:basis-auto">
          {connected ? (
            <StatusPill status="done">{accountLabel ? `Connected · ${accountLabel}` : "Connected"}</StatusPill>
          ) : (
            <span className="text-small text-[var(--fg-muted)]">{statusText}</span>
          )}
        </div>
      </div>
      {children && <div className="flex flex-wrap items-center gap-3">{children}</div>}
    </GlassCard>
  );
}
