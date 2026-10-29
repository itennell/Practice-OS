import { connection } from "next/server";
import { Suspense } from "react";
import { AreaExplorer } from "@/components/referrals/area-explorer";
import { ReferralBoard } from "@/components/referrals/board";
import { PageHeader } from "@/components/ui";
import { DEFAULT_SPECIALTIES, getReferralSettings } from "@/lib/referrals/settings";
import { STAGE_LABEL } from "@/lib/referrals/stages";
import { latestLetters, listSources, practiceFocus } from "@/lib/referrals/store";
import { tierFor, type TierResult } from "@/lib/referrals/tier";

export const metadata = { title: "Referrals · Practice-OS" };

export default function ReferralsPage() {
  return (
    <>
      <PageHeader
        title="Referrals"
        description="Doctors and clinicians near you from the free federal NPI Registry, on a map and in the order to reach out. Add the ones you like to your board, draft a letter, and send it yourself. Nothing is ever offered in return for a referral."
      />
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Referrals />
      </Suspense>
    </>
  );
}

async function Referrals() {
  await connection(); // read the database per request, never at build time
  const [sources, letters, setup, focus] = await Promise.all([listSources(), latestLetters(), getReferralSettings(), practiceFocus()]);
  const board = Object.fromEntries(sources.filter((s) => s.npi).map((s) => [s.npi!, { stage: STAGE_LABEL[s.stage] }]));
  const tiers: Record<string, TierResult> = Object.fromEntries(
    sources.map((s) => [s.id, tierFor({ taxonomy: s.taxonomy, npiType: s.npi_type }, { miles: s.distance_miles, focus })]),
  );
  return (
    <div className="flex flex-col gap-8">
      <AreaExplorer
        defaultArea={setup.searchZip ?? ""}
        specialties={setup.specialties.length ? setup.specialties : DEFAULT_SPECIALTIES}
        board={board}
      />
      <section aria-labelledby="board-heading" className="flex flex-col gap-3">
        <h2 id="board-heading" className="text-body font-semibold">
          Your board
        </h2>
        <ReferralBoard initial={sources} letters={letters} tiers={tiers} />
      </section>
    </div>
  );
}
