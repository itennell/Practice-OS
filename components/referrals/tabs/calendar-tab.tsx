"use client";

// Referrals › Calendar (stub). A placeholder until this tab is built: a client component
// with no required props that will fetch its own data. Replace the body, keep the export.

import { CalendarDays } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function CalendarTab({ partnerId }: { /** Picked from a partner's "Plan a meeting"; optional. */ partnerId?: string | null } = {}) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      {partnerId && <p className="px-5 pt-4 text-small text-[var(--fg-muted)]" data-testid="calendar-partner">Planning a meeting with the partner you picked.</p>}
      <EmptyState icon={<CalendarDays size={20} />} title="Calendar">
        Follow-ups and coffee meetings with your partners on a calendar. Coming next.
      </EmptyState>
    </div>
  );
}
