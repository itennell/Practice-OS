"use client";

// Referrals › Board (stub). A placeholder until this tab is built: a client component
// with no required props that will fetch its own data. Replace the body, keep the export.

import { Columns3 } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function BoardTab() {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <EmptyState icon={<Columns3 size={20} />} title="Board">
        Your partners as cards in columns (Found, Contacted, Follow up, Connected), to drag from one stage to the next. Coming next.
      </EmptyState>
    </div>
  );
}
