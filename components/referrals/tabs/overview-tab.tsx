"use client";

// Referrals › Overview (stub). A placeholder until this tab is built: a client component
// with no required props that will fetch its own data. Replace the body, keep the export.

import { LayoutDashboard } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function OverviewTab() {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <EmptyState icon={<LayoutDashboard size={20} />} title="Overview">
        How your referral network is doing, at a glance: who to reach this week, letters waiting and referrals over time. Coming next.
      </EmptyState>
    </div>
  );
}
