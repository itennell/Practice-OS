import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ComingNext } from "@/components/coming-next";
import { OfficeSettings } from "@/components/office-settings";
import { GlassCard } from "@/components/ui";
import { loadPracticeSettings } from "@/lib/gfe/store";
import { DefaultModeSetting, FrontDeskRules } from "@/components/approval-settings";
import { loadApprovalSettings } from "@/lib/approval-settings";

export const metadata: Metadata = { title: "Settings · Practice-OS" };

export default function Page() {
  return (
    <>
      <ComingNext title="Settings">
        Connect Instagram, Gmail, Cal.com and your phone number.
      </ComingNext>
      <Suspense fallback={<div aria-hidden className="h-96 max-w-3xl animate-pulse rounded-[24px] bg-[var(--glass-strong)]" />}>
        <Modes />
        <Office />
      </Suspense>
    </>
  );
}

async function Modes() {
  await connection(); // read the database per request, never at build time
  const { mode, frontDesk } = await loadApprovalSettings();
  return (
    <>
      <GlassCard aria-labelledby="modes-heading" className="flex max-w-3xl flex-col gap-2 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="modes-heading" className="text-section font-semibold">
            How Aeon works in chat
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">
            In every mode, superbills, Good Faith Estimates, release forms and anything you hand to a client wait for you. Aeon never sends
            anything to a client. Saving a memory never needs your OK.
          </p>
        </div>
        <DefaultModeSetting initial={mode} />
      </GlassCard>
      <GlassCard aria-labelledby="front-desk-heading" className="flex max-w-3xl flex-col gap-2 p-6 md:p-8">
        <div className="flex flex-col gap-1">
          <h2 id="front-desk-heading" className="text-section font-semibold">
            Front Desk
          </h2>
          <p className="max-w-[60ch] text-[var(--fg-muted)]">Front Desk follows its own rules, whatever mode your chats are in.</p>
        </div>
        <FrontDeskRules initial={frontDesk} />
      </GlassCard>
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
