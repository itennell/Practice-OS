import { after, connection } from "next/server";
import { Suspense } from "react";
import { AreaExplorer } from "@/components/referrals/area-explorer";
import { ReferralBoard } from "@/components/referrals/board";
import { PageHeader } from "@/components/ui";
import { DEFAULT_SPECIALTIES, getReferralSettings } from "@/lib/referrals/settings";
import { STAGE_LABEL } from "@/lib/referrals/stages";
import { getProfile } from "@/lib/profile";
import { evidenceFor } from "@/lib/referrals/evidence/store";
import { recheckIfDue, recheckDeps } from "@/lib/referrals/sources/recheck";
import { latestLetters, listSources, practiceFacts, rescoreOldCards } from "@/lib/referrals/store";
import { boardTier, SCORE_VERSION, type TierResult } from "@/lib/referrals/tier";

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
  const [sources, letters, setup, facts, profile] = await Promise.all([
    listSources(),
    latestLetters(),
    getReferralSettings(),
    practiceFacts(),
    getProfile(),
  ]);
  // Cards scored by an older formula are scored again after the page is sent.
  if (sources.some((s) => s.score_version !== SCORE_VERSION)) {
    after(() => rescoreOldCards().catch((err) => console.error(`[referrals] rescore: ${err instanceof Error ? err.message : String(err)}`)));
  }
  // Cards last checked over 30 days ago are checked again once a day, after the page is sent (her computer only).
  if (!process.env.VERCEL) {
    after(() => recheckIfDue(recheckDeps()).catch((err) => console.error(`[referrals] recheck: ${err instanceof Error ? err.message : String(err)}`)));
  }
  const evidence = await evidenceFor(sources);
  const board = Object.fromEntries(sources.filter((s) => s.npi).map((s) => [s.npi!, { stage: STAGE_LABEL[s.stage] }]));
  const tiers: Record<string, TierResult> = Object.fromEntries(
    sources.map((s) => [s.id, boardTier(s, { focus: facts.focus, clinicianState: facts.state })]),
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
        <ReferralBoard initial={sources} letters={letters} tiers={tiers} evidence={evidence} demo={profile?.is_sample ?? true} />
      </section>
    </div>
  );
}
