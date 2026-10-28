import { connection } from "next/server";
import { Suspense } from "react";
import { ReferralBoard } from "@/components/referrals/board";
import { ReferralSearch } from "@/components/referrals/search";
import { GlassCard } from "@/components/ui";
import { latestLetters, listSources } from "@/lib/referrals/store";

export const metadata = { title: "Referrals · Practice-OS" };

export default function ReferralsPage() {
  return (
    <>
      <header className="flex flex-col gap-2">
        <h1 className="text-title">Referrals</h1>
        <p className="max-w-[65ch] text-[var(--fg-muted)]">
          Doctors and clinicians near you from the free federal NPI Registry, from first letter to a real connection. Letters
          become Gmail drafts in your test inbox; you press send. Nothing is ever offered in return for a referral.
        </p>
      </header>
      <GlassCard className="p-5 md:p-6">
        <ReferralSearch />
      </GlassCard>
      <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
        <Board />
      </Suspense>
    </>
  );
}

async function Board() {
  await connection(); // read the database per request, never at build time
  const [sources, letters] = await Promise.all([listSources(), latestLetters()]);
  return <ReferralBoard initial={sources} letters={letters} />;
}
