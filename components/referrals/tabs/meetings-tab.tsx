"use client";

// Referrals › Meetings and notes (stub). A placeholder until this tab is built: a client component
// with no required props that will fetch its own data. Replace the body, keep the export.

import { NotebookPen } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function MeetingsTab() {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <EmptyState icon={<NotebookPen size={20} />} title="Meetings and notes">
        Your debriefs and notes from each meeting, in one place. Coming next.
      </EmptyState>
    </div>
  );
}
