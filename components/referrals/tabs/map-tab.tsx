"use client";

// Referrals › Map (stub). A placeholder until this tab is built: a client component
// with no required props that will fetch its own data. Replace the body, keep the export.

import { Map } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

export function MapTab() {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card-sm)] border border-[var(--line)] bg-[var(--glass)]">
      <EmptyState icon={<Map size={20} />} title="Map">
        Your partners on a map around your office. Coming next. For now, Find partners shows the map search.
      </EmptyState>
    </div>
  );
}
