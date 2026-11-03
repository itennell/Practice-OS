// The Referrals page's numbers and the call script's facts (server only).
// - Partners: cards on her board that aren't in Not a fit.
// - Reach out this week: the weekly plan (plan.ts outreachPlan): follow-ups due, new
//   people to reach out to, and people going cold.
// - Waiting on you: referral letters waiting for her approval.
// - Referrals this month: "they referred someone" logged in the last 30 days (a date only).
import type postgres from "postgres";
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { loadMediaFacts } from "../media/facts";
import { listPayerApplications, WAITING } from "../payers/store";
import type { ScriptFacts } from "./call-script";
import { nicheWords } from "./outreach";
import { outreachPlan } from "./plan";
import { practiceFacts, type ReferralSource } from "./store";
import { FOCUS_WORDS, type Focus } from "./tier";

export type ReferralCounts = { partners: number; reachOut: number; waiting: number; referredThisMonth: number };

export const REFERRED_WINDOW_DAYS = 30;

export async function referralCounts(cards: Pick<ReferralSource, "stage">[], sql: postgres.Sql = db()): Promise<ReferralCounts> {
  const today = await practiceToday(sql);
  const [plan, [waiting], [referred]] = await Promise.all([
    outreachPlan(sql).catch(() => null),
    sql<{ n: number }[]>`select count(*)::int as n from practice_os.approvals where kind = 'referral_letter' and status = 'pending'`.catch(() => [{ n: 0 }]),
    sql<{ n: number }[]>`
      select count(*)::int as n from practice_os.referral_contacts
       where kind = 'referred' and happened_on > ${today}::date - ${REFERRED_WINDOW_DAYS}::int and happened_on <= ${today}::date`.catch(() => [{ n: 0 }]),
  ]);
  return {
    partners: cards.filter((c) => c.stage !== "not_a_fit").length,
    reachOut: plan ? plan.follow_ups.length + plan.reach_out.length + plan.going_cold.length : 0,
    waiting: waiting?.n ?? 0,
    referredThisMonth: referred?.n ?? 0,
  };
}

/** Her practice for the call script: her own settings and profile, nothing guessed. */
export async function scriptFacts(): Promise<ScriptFacts> {
  const [media, payers, practice] = await Promise.all([
    loadMediaFacts().catch(() => null),
    listPayerApplications().catch(() => []),
    practiceFacts().catch(() => ({ focus: [] as Focus[], state: null, niche: null, selfPay: false })),
  ]);
  const inNetwork = media?.inNetwork ?? [];
  return {
    name: media?.name ?? null,
    credential: media?.credential ?? null,
    practice: media?.practiceName ?? null,
    place: media ? [media.neighborhood, media.city].filter(Boolean).join(", ") || null : null,
    phone: media?.phone?.trim() || null,
    email: media?.email?.trim() || null,
    niche: nicheWords(practice.niche)?.words ?? null,
    whoSheHelps: practice.focus.map((f) => FOCUS_WORDS[f]),
    inNetwork,
    appliedPending: [...new Set(payers.filter((p) => WAITING.includes(p.status) && !inNetwork.includes(p.payer)).map((p) => p.payer))],
    privatePay: Boolean(media?.fees.length),
    slidingScale: media?.slidingScale ?? null,
    telehealth: media?.telehealth ?? false,
    isSample: media?.isSample ?? true,
  };
}
