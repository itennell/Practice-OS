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
import { latestLetters, listSources, moveDueFollowUps, practiceFacts, rescoreOldCards, tierContext } from "@/lib/referrals/store";
import { contactsFor } from "@/lib/referrals/contacts";
import { rankCards, tiersWithLog } from "@/lib/referrals/plan";
import { scoreVersionFor, type TierResult } from "@/lib/referrals/tier";

export const metadata = { title: "Referrals · Practice-OS" };

export default function ReferralsPage({ searchParams }: PageProps<"/referrals">) {
  return (
    <>
      <PageHeader
        title="Referrals"
        description="Doctors and clinicians near you from the free federal NPI Registry, on a map and in the order to reach out. Add the ones you like to your board, draft a letter, and send it yourself. Nothing is ever offered in return for a referral."
      />
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Referrals searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Referrals({ searchParams }: { searchParams: PageProps<"/referrals">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  // The chat's debrief_meeting card opens /referrals?debrief=<card id>: that card's recorder opens.
  const { debrief } = await searchParams;
  const openDebrief = typeof debrief === "string" && /^[0-9a-f-]{36}$/i.test(debrief) ? debrief : null;
  const [sources, letters, setup, facts, profile] = await Promise.all([
    listSources(),
    latestLetters(),
    getReferralSettings(),
    practiceFacts(),
    getProfile(),
  ]);
  // Cards scored by an older formula, or for a niche she has since changed, are scored again after the page is sent.
  if (sources.some((s) => s.score_version !== scoreVersionFor(facts.niche))) {
    after(() => rescoreOldCards().catch((err) => console.error(`[referrals] rescore: ${err instanceof Error ? err.message : String(err)}`)));
  }
  // Cards last checked over 30 days ago are checked again once a day, after the page is sent (her computer only).
  if (!process.env.VERCEL) {
    // The board already shows due follow-ups in Follow up; on her computer the move is saved too, with an audit row.
    after(() => moveDueFollowUps().catch((err) => console.error(`[referrals] follow-ups: ${err instanceof Error ? err.message : String(err)}`)));
    after(() => recheckIfDue(recheckDeps()).catch((err) => console.error(`[referrals] recheck: ${err instanceof Error ? err.message : String(err)}`)));
  }
  const evidence = await evidenceFor(sources);
  const board = Object.fromEntries(sources.filter((s) => s.npi).map((s) => [s.npi!, { stage: STAGE_LABEL[s.stage] }]));
  // Tiers with her contact log on top (a prior referral, a warm intro, a meeting, a reply).
  const contacts = await contactsFor(sources.map((s) => s.id));
  const tiers: Record<string, TierResult> = tiersWithLog(sources, contacts, tierContext(facts));
  // Each column in the one order (tier, niche weight, fit, score, distance).
  const ranked = rankCards(sources, tiers);
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
        <ReferralBoard initial={ranked} letters={letters} tiers={tiers} evidence={evidence} contacts={contacts} demo={profile?.is_sample ?? true} openDebrief={openDebrief} />
      </section>
    </div>
  );
}
