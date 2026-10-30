// "Who should I reach out to this week?" in plain code: follow-ups that are
// due first, then a few new people from the top of the board. Someone she
// reached out to in the last 30 days waits (referral-tiers.json "suppress"),
// and an NPI on the do-not-contact list is never suggested.
import type postgres from "postgres";
import research from "../../docs/research/referral-tiers.json" with { type: "json" };
import { practiceToday } from "../compliance/store";
import { db } from "../db";
import { orgNameScore } from "./evidence/match";
import { jaroWinkler, normalizeName, normalizeOrg } from "./evidence/normalize";
import { contactsFor, relationshipFrom, suppressedNpis, type Contact } from "./contacts";
import { STAGE_LABEL } from "./stages";
import { listSources, practiceFacts, type ReferralSource } from "./store";
import { boardTier, TIER_LABEL, withRelationship, type Focus, type TierResult } from "./tier";

/** At most this many new people a week: the research aims at 3 to 5 letters a month for the top tier. */
export const NEW_PER_WEEK = 3;
const WAIT_DAYS =
  (research as { relationship_modifiers?: { suppress?: { contacted_within_days?: number } } }).relationship_modifiers?.suppress?.contacted_within_days ?? 30;

export type FollowUp = { id: string; name: string; on: string; days_left: number; stage: string; last: string | null };
export type PlanItem = { id: string; name: string; why: string; next_step: string; tier: string; score: number };
export type OutreachPlan = { today: string; follow_ups: FollowUp[]; reach_out: PlanItem[]; waiting: number; summary: string };

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000);
}

const LAST_WORDS: Record<Contact["kind"], string> = {
  called: "you called",
  emailed: "you emailed",
  met: "you met",
  sent_letter: "you sent the letter",
  replied: "they replied",
  note: "a note",
  referred: "they referred someone",
};

/** Cards whose follow-up date is within `days` (overdue included), soonest first. */
export function followUpsFrom(cards: ReferralSource[], contacts: Record<string, Contact[]>, today: string, days = 7): FollowUp[] {
  return cards
    .filter((c) => c.next_follow_up_on && c.stage !== "not_a_fit" && daysBetween(today, c.next_follow_up_on) <= days)
    .map((c) => {
      const last = contacts[c.id]?.[0];
      return {
        id: c.id,
        name: c.name,
        on: c.next_follow_up_on!,
        days_left: daysBetween(today, c.next_follow_up_on!),
        stage: STAGE_LABEL[c.stage],
        last: last ? `${LAST_WORDS[last.kind]} on ${last.happened_on}` : null,
      };
    })
    .sort((a, b) => a.on.localeCompare(b.on));
}

/** Each card's tier with her log on top (prior referral, warm intro, met, replied). */
export function tiersWithLog(
  cards: ReferralSource[],
  contacts: Record<string, Contact[]>,
  ctx: { focus: Focus[]; clinicianState: string | null },
): Record<string, TierResult> {
  return Object.fromEntries(
    cards.map((c) => [c.id, withRelationship(boardTier(c, ctx), relationshipFrom(contacts[c.id] ?? [], c.introduced_by ?? null))]),
  );
}

export async function outreachPlan(sql: postgres.Sql = db(), max = NEW_PER_WEEK): Promise<OutreachPlan> {
  const [cards, today, facts, blocked] = await Promise.all([listSources(sql), practiceToday(sql), practiceFacts(sql), suppressedNpis(sql)]);
  const contacts = await contactsFor(cards.map((c) => c.id), sql);
  const tiers = tiersWithLog(cards, contacts, { focus: facts.focus, clinicianState: facts.state });
  const follow_ups = followUpsFrom(cards, contacts, today);
  const due = new Set(follow_ups.map((f) => f.id));

  let waiting = 0;
  const fresh = cards.filter((c) => {
    if (c.stage !== "found" || due.has(c.id) || (c.npi && blocked.has(c.npi))) return false;
    const last = relationshipFrom(contacts[c.id] ?? [], null).lastContactOn ?? c.last_contacted_at?.slice(0, 10) ?? null;
    if (last && daysBetween(last, today) < WAIT_DAYS) {
      waiting++;
      return false;
    }
    return tiers[c.id].tier !== "later";
  });
  const reach_out = fresh
    .sort((a, b) => tiers[b.id].score - tiers[a.id].score || (a.distance_miles ?? 99) - (b.distance_miles ?? 99))
    .slice(0, max)
    .map((c) => {
      const t = tiers[c.id];
      return {
        id: c.id,
        name: c.name,
        tier: TIER_LABEL[t.tier],
        score: t.score,
        why: t.reasons.slice(1, 4).join("; "),
        next_step: c.introduced_by
          ? `Ask ${c.introduced_by} to introduce you, then draft a short letter.`
          : c.email
            ? "Draft a short introduction letter, approve it, and send it from your own email."
            : "Call the office, ask who handles referrals, then send a short letter.",
      };
    });
  return { today, follow_ups, reach_out, waiting, summary: summarizePlan({ follow_ups, reach_out, waiting }) };
}

export function summarizePlan(p: Pick<OutreachPlan, "follow_ups" | "reach_out" | "waiting">): string {
  const lines: string[] = [];
  if (p.follow_ups.length) {
    lines.push(`Follow-ups (${p.follow_ups.length}):`);
    for (const f of p.follow_ups) {
      const when = f.days_left < 0 ? `${-f.days_left} days overdue` : f.days_left === 0 ? "today" : `in ${f.days_left} days`;
      lines.push(`- ${f.name}: ${when}${f.last ? ` (last: ${f.last})` : ""}`);
    }
  }
  if (p.reach_out.length) {
    lines.push(`New this week (${p.reach_out.length}):`);
    for (const r of p.reach_out) lines.push(`- ${r.name} (${r.tier}): ${r.why}. ${r.next_step}`);
  }
  if (!p.follow_ups.length && !p.reach_out.length) lines.push("Nobody new to reach out to this week. Search the map for more, or check in with someone you know.");
  if (p.waiting) lines.push(`${p.waiting} more you reached out to in the last ${WAIT_DAYS} days: give them time.`);
  lines.push("Aeon never offers anything in return for a referral.");
  return lines.join("\n");
}

/** For the morning brief: follow-ups due in the next 7 days, overdue included. */
export async function referralFollowUps(sql: postgres.Sql = db()): Promise<FollowUp[]> {
  const [cards, today] = await Promise.all([listSources(sql), practiceToday(sql)]);
  const contacts = await contactsFor(cards.map((c) => c.id), sql);
  return followUpsFrom(cards, contacts, today);
}

/** Board cards that her words name ("Dr. Rivera", "Lakeview Pediatrics"), best first. */
export function cardsNamed(query: string, cards: ReferralSource[]): ReferralSource[] {
  const q = query.trim();
  if (!q) return [];
  const words = normalizeName(q);
  const org = normalizeOrg(q);
  const scored = cards
    .map((c) => {
      const isOrg = c.npi_type === "organization";
      const person = normalizeName(c.name);
      let score = 0;
      if (isOrg || c.organization) {
        const o = normalizeOrg(c.organization ?? c.name);
        if (org && (o.includes(org) || orgNameScore(o, org) >= 0.9)) score = Math.max(score, o === org ? 1 : 0.9);
      }
      if (!isOrg && words.last) {
        const last = Math.max(...words.lasts.flatMap((a) => person.lasts.map((b) => jaroWinkler(a, b))));
        // "Dr. Rivera" names the last name only; with a first name it has to fit too.
        const first = words.tokens.length > 1 ? jaroWinkler(words.first, person.first) : 1;
        if (last >= 0.94 && first >= 0.85) score = Math.max(score, 0.6 * last + 0.4 * first);
      }
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.c);
}

/** One card as the board shows it after a change: the card, its tier with the log, and its log. */
export async function cardView(id: string, sql: postgres.Sql = db()) {
  const card = (await listSources(sql)).find((c) => c.id === id) ?? null;
  if (!card) return null;
  const [facts, contacts] = await Promise.all([practiceFacts(sql), contactsFor([id], sql)]);
  const tier = tiersWithLog([card], contacts, { focus: facts.focus, clinicianState: facts.state })[id];
  return { card, tier, contacts: contacts[id] ?? [] };
}
