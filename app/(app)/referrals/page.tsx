import { connection } from "next/server";
import { Suspense } from "react";
import { ReferralBoard } from "@/components/referrals/board";
import { ReferralSearch } from "@/components/referrals/search";
import { GlassCard, PageHeader } from "@/components/ui";
import { DEFAULT_SPECIALTIES, getReferralSettings } from "@/lib/referrals/settings";
import { latestLetters, listSources } from "@/lib/referrals/store";

export const metadata = { title: "Referrals · Practice-OS" };

export default function ReferralsPage() {
  return (
    <>
      <PageHeader
        title="Referrals"
        description="Doctors and clinicians near you from the free federal NPI Registry, from first letter to a real connection. Letters become Gmail drafts in your test inbox; you press send. Nothing is ever offered in return for a referral."
      />
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  await connection(); // read the database per request, never at build time
  const [sources, letters, setup] = await Promise.all([listSources(), latestLetters(), getReferralSettings()]);
  return (
    <>
      <GlassCard className="p-5 md:p-6">
        <ReferralSearch zip={setup.searchZip ?? ""} specialties={setup.specialties.length ? setup.specialties : DEFAULT_SPECIALTIES} />
      </GlassCard>
      <ReferralBoard initial={sources} letters={letters} />
    </>
  );
}
