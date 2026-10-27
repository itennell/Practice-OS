import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ComingNext } from "@/components/coming-next";
import { OfficeSettings } from "@/components/office-settings";
import { GlassCard } from "@/components/ui";
import { loadPracticeSettings } from "@/lib/gfe/store";

export const metadata: Metadata = { title: "Settings · Practice-OS" };

export default function Page() {
  return (
    <>
      <ComingNext title="Settings">
        Choose which kinds of actions run without asking, and connect Instagram, Gmail, Cal.com and your phone number.
      </ComingNext>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--glass-strong)]" />}>
        <Office />
      </Suspense>
    </>
  );
}

async function Office() {
  await connection(); // read the database per request, never at build time
  const { hours, fees } = await loadPracticeSettings();
  return (
    <GlassCard aria-labelledby="office-heading" className="flex max-w-3xl flex-col gap-4 p-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h2 id="office-heading" className="text-section font-semibold">
          Office hours and fees
        </h2>
        <p className="max-w-[60ch] text-[var(--fg-muted)]">
          Good Faith Estimate due dates count only the days you’re open. Your fees fill in new estimates.
        </p>
      </div>
      <OfficeSettings initialHours={hours} initialFees={fees} />
    </GlassCard>
  );
}
