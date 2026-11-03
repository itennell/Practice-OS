import { after, connection } from "next/server";
import { Suspense } from "react";
import { SOURCE_TYPES, CATEGORIES } from "@/lib/referrals/catalog";
import { discoverableTypes, discoveryTypes } from "@/lib/referrals/orgs";
import { db } from "@/lib/db";
import { ReferralsCrm } from "@/components/referrals/referrals-crm";
import { isReferralTab } from "@/lib/referrals/tabs";
import { DEFAULT_SPECIALTIES, getReferralSettings } from "@/lib/referrals/settings";
import { STAGE_LABEL } from "@/lib/referrals/stages";
import { getProfile } from "@/lib/profile";
import { evidenceFor } from "@/lib/referrals/evidence/store";
import { recheckIfDue, recheckDeps } from "@/lib/referrals/sources/recheck";
import { latestLetters, listSources, moveDueFollowUps, practiceFacts, rescoreOldCards, tierContext } from "@/lib/referrals/store";
import { contactsFor } from "@/lib/referrals/contacts";
import { referOutNotesFor } from "@/lib/referrals/refer-out";
import { practiceTimeZone } from "@/lib/compliance/store";
import { todayIn } from "@/lib/compliance/dates";
import { rankCards, tiersWithLog } from "@/lib/referrals/plan";
import { salutationFor } from "@/lib/referrals/outreach";
import { referralCounts, scriptFacts } from "@/lib/referrals/crm";
import { scoreVersionFor, type TierResult } from "@/lib/referrals/tier";

export const metadata = { title: "Referrals · Practice-OS" };

const UUID = /^[0-9a-f-]{36}$/i;

export default function ReferralsPage({ searchParams }: PageProps<"/referrals">) {
  return (
    <Suspense fallback={<div aria-hidden className="h-96 animate-pulse rounded-[24px] bg-[var(--hairline)]" />}>
      <Referrals searchParams={searchParams} />
    </Suspense>
  );
}

async function Referrals({ searchParams }: { searchParams: PageProps<"/referrals">["searchParams"] }) {
  await connection(); // read the database per request, never at build time
  // ?tab= picks the tab. The chat's debrief_meeting card opens /referrals?debrief=<card id>: that
  // partner's panel opens with its recorder; ?partner=<id> opens the panel alone.
  const { debrief, partner, tab } = await searchParams;
  const openDebrief = typeof debrief === "string" && UUID.test(debrief) ? debrief : null;
  const openPartner = typeof partner === "string" && UUID.test(partner) ? partner : null;
  const initialTab = isReferralTab(tab) ? tab : "partners";
  const [sources, letters, setup, facts, profile, script] = await Promise.all([
    listSources(),
    latestLetters(),
    getReferralSettings(),
    practiceFacts(),
    getProfile(),
    scriptFacts(),
  ]);
  // Cards scored by an older formula, or for a niche she has since changed, are scored again after the page is sent.
  if (sources.some((s) => s.score_version !== scoreVersionFor(facts.niche))) {
    after(() => rescoreOldCards().catch((err) => console.error(`[referrals] rescore: ${err instanceof Error ? err.message : String(err)}`)));
  }
  // Cards last checked over 30 days ago are checked again once a day, after the page is sent (her computer only).
  if (!process.env.VERCEL) {
    // Due follow-ups already show as Follow up; on her computer the move is saved too, with an audit row.
    after(() => moveDueFollowUps().catch((err) => console.error(`[referrals] follow-ups: ${err instanceof Error ? err.message : String(err)}`)));
    after(() => recheckIfDue(recheckDeps()).catch((err) => console.error(`[referrals] recheck: ${err instanceof Error ? err.message : String(err)}`)));
  }
  const evidence = await evidenceFor(sources);
  const [nicheRow] = await db()<{ niche_preset: string | null }[]>`select niche_preset from practice_os.referral_settings where id`.catch(() => []);
  const category = new Map(CATEGORIES.map((c) => [c.id, c.label]));
  const typeOptions = [...SOURCE_TYPES]
    .sort((a, b) => a.category - b.category || a.label.localeCompare(b.label))
    .map((t) => ({ value: t.id, label: `${t.label} (${category.get(t.category) ?? "Other"})`, sensitive: t.sensitive }));
  const board = Object.fromEntries(sources.filter((s) => s.npi).map((s) => [s.npi!, { stage: STAGE_LABEL[s.stage] }]));
  // Tiers with her contact log on top (a prior referral, a warm intro, a meeting, a reply).
  const [contacts, referOut, timeZone, counts] = await Promise.all([
    contactsFor(sources.map((s) => s.id)),
    referOutNotesFor(sources.map((s) => s.id)),
    practiceTimeZone(),
    referralCounts(sources),
  ]);
  const today = todayIn(timeZone);
  const tiers: Record<string, TierResult> = tiersWithLog(sources, contacts, tierContext(facts));
  // One order everywhere (tier, niche weight, fit, score, distance).
  const ranked = rankCards(sources, tiers);
  const greetings = Object.fromEntries(sources.map((s) => [s.id, salutationFor(s)]));
  // ?tab=calendar&partner=<id> picks the partner for the calendar instead (Plan a meeting).
  const openId = openDebrief ?? (initialTab === "calendar" ? null : openPartner);
  return (
    <ReferralsCrm
      initialTab={openId ? "partners" : initialTab}
      initialOpen={openId && sources.some((s) => s.id === openId) ? { id: openId, debrief: Boolean(openDebrief) } : null}
      initialCalendarPartner={initialTab === "calendar" ? openPartner : null}
      counts={counts}
      partners={{ cards: ranked, letters, tiers, evidence, contacts, referOut, greetings, script, today, timeZone, demo: profile?.is_sample ?? true }}
      finder={{
        defaultArea: setup.searchZip ?? "",
        specialties: setup.specialties.length ? setup.specialties : DEFAULT_SPECIALTIES,
        board,
        placeKinds: discoverableTypes(),
        defaultKinds: discoveryTypes(null, nicheRow?.niche_preset ?? null),
        types: typeOptions,
      }}
    />
  );
}
