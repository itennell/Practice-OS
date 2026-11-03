// Keeping referral relationships warm, in plain code (no database, so the
// board can use it too): how often to be in touch by tier (referral-tiers.json
// "touch_cadence", judgment), which cards are going cold, the weekly plan's
// going-cold nudges, the reciprocity line ("They've referred N · You've
// referred M", from dates and counts only) and who is on her "People I refer
// to" list. Days are counted between practice-time-zone dates (todayIn).
import research from "../../docs/research/referral-tiers.json" with { type: "json" };
import { daysBetween, todayIn } from "../compliance/dates";
import type { Contact } from "./contacts";
import type { ReferralSource } from "./store";
import type { Tier, TierResult } from "./tier";

export type Cadence = { minWeeks: number; maxWeeks: number; words: string };

const BUILT_IN: { grace: number; perWeek: number; byTier: Record<Tier, Cadence> } = {
  grace: 7,
  perWeek: 2,
  byTier: {
    first: { minWeeks: 6, maxWeeks: 8, words: "every 6 to 8 weeks" },
    next: { minWeeks: 12, maxWeeks: 12, words: "every 12 weeks" },
    later: { minWeeks: 13, maxWeeks: 13, words: "every quarter" },
  },
};

type RawCadence = { min_weeks?: unknown; max_weeks?: unknown; words?: unknown };

/** The research file's touch cadence. Throws, saying what is missing, if its shape changed. */
export function readCadence(file: unknown): typeof BUILT_IN {
  const c = (file as { touch_cadence?: { grace_days?: unknown; nudges_per_week?: unknown; by_tier?: Record<string, RawCadence> } }).touch_cadence;
  if (!c?.by_tier) throw new Error("touch_cadence.by_tier is missing");
  const one = (t: Tier): Cadence => {
    const r = c.by_tier![t];
    if (!r || typeof r.min_weeks !== "number" || typeof r.max_weeks !== "number" || typeof r.words !== "string" || r.min_weeks > r.max_weeks) {
      throw new Error(`touch_cadence.by_tier.${t} needs min_weeks <= max_weeks and words`);
    }
    return { minWeeks: r.min_weeks, maxWeeks: r.max_weeks, words: r.words };
  };
  if (typeof c.grace_days !== "number" || typeof c.nudges_per_week !== "number") throw new Error("touch_cadence needs grace_days and nudges_per_week");
  return { grace: c.grace_days, perWeek: c.nudges_per_week, byTier: { first: one("first"), next: one("next"), later: one("later") } };
}

function load() {
  try {
    return readCadence(research);
  } catch (err) {
    console.error(`[referrals] docs/research/referral-tiers.json: ${err instanceof Error ? err.message : String(err)}. Using the built-in cadence.`);
    return BUILT_IN;
  }
}

const LOADED = load();
export const CADENCE: Record<Tier, Cadence> = LOADED.byTier;
export const GRACE_DAYS = LOADED.grace;
/** At most this many going-cold nudges in a weekly plan. */
export const COLD_NUDGES_PER_WEEK = LOADED.perWeek;

/** Days without contact after which a card of this tier is going cold. */
export function coldAfterDays(tier: Tier): number {
  return CADENCE[tier].maxWeeks * 7 + GRACE_DAYS;
}

type CardBits = Pick<ReferralSource, "stage" | "last_contacted_at"> & { suggested_from?: string | null };
type LogBits = Pick<Contact, "kind" | "happened_on">;

/**
 * Two "last contact" days exist, on purpose:
 * - Relationship.lastContactOn (contacts.ts relationshipFrom): the latest call, email, letter or
 *   meeting. It drives the tiers and the plan's 30-day wait before suggesting someone again.
 * - lastTouchOn (here): the latest day ANYTHING happened with them, any kind on the log
 *   (a note, a referral either way) or the card's last_contacted_at. It drives "going cold".
 * last_contacted_at is a timestamptz, read as its day in the practice's time zone.
 */
export function lastTouchOn(card: Pick<ReferralSource, "last_contacted_at">, contacts: LogBits[], timeZone: string): string | null {
  const days = contacts.map((c) => c.happened_on);
  // The driver hands back a Date (typed as a string elsewhere; the page gets either).
  const at = card.last_contacted_at as string | Date | null;
  if (at) {
    const d = at instanceof Date ? at : new Date(at);
    if (!Number.isNaN(d.getTime())) days.push(todayIn(timeZone, d));
  }
  return days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort().at(-1) ?? null;
}

export type GoingCold = { lastOn: string; days: number; weeks: number; cadence: string; label: string };

/** "Going cold: last contact 9 weeks ago". */
export function coldLabel(days: number): string {
  const weeks = Math.floor(days / 7);
  return `Going cold: last contact ${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
}

/**
 * Going cold: she has been in touch before, and the last contact of any kind is
 * older than the tier's cadence plus the grace days. Never for Not a fit, a
 * card she never contacted, or one with no tier yet. `today` is the practice's
 * date (todayIn(practiceTimeZone)).
 */
export function goingCold(card: CardBits, contacts: LogBits[], tier: Tier | undefined, today: string, timeZone: string): GoingCold | null {
  if (!tier || card.stage === "not_a_fit") return null;
  const lastOn = lastTouchOn(card, contacts, timeZone);
  if (!lastOn) return null;
  const days = daysBetween(lastOn, today);
  if (days <= coldAfterDays(tier)) return null;
  return { lastOn, days, weeks: Math.floor(days / 7), cadence: CADENCE[tier].words, label: coldLabel(days) };
}

/** Each card that is going cold, by id. */
export function coldCards(
  cards: (CardBits & Pick<ReferralSource, "id">)[],
  contacts: Record<string, LogBits[]>,
  tiers: Record<string, Pick<TierResult, "tier">>,
  today: string,
  timeZone: string,
): Record<string, GoingCold> {
  const out: Record<string, GoingCold> = {};
  for (const c of cards) {
    const cold = goingCold(c, contacts[c.id] ?? [], tiers[c.id]?.tier, today, timeZone);
    if (cold) out[c.id] = cold;
  }
  return out;
}

export type ColdNudge = { id: string; name: string; tier: string; weeks: number; label: string; cadence: string; action: string };

export const NOTE_ACTION =
  "Send a short follow-up note: press Draft a follow-up note on their card, approve it in Approvals, then copy it and send it from your own email.";
export const ONE_PAGER_ACTION =
  "Drop off or attach a one-page overview of your practice (who you see, your fees and how to refer). You hand it over yourself.";

const TIER_ORDER: Record<Tier, number> = { first: 0, next: 1, later: 2 };

/**
 * Up to `max` going-cold nudges for the weekly plan: the top tier first, then
 * the longest without contact. `skip` holds cards already in the plan (a due
 * follow-up), on her do-not-contact list, or with a letter waiting or ready. A card with an email gets the
 * note; one without gets the one-pager.
 */
export function coldNudges(
  cards: (CardBits & Pick<ReferralSource, "id" | "name" | "email"> & Partial<Pick<ReferralSource, "sensitive">>)[],
  contacts: Record<string, LogBits[]>,
  tiers: Record<string, Pick<TierResult, "tier">>,
  today: string,
  timeZone: string,
  opts: { skip?: Set<string>; max?: number; tierLabel?: Record<Tier, string> } = {},
): ColdNudge[] {
  const max = opts.max ?? COLD_NUDGES_PER_WEEK;
  const cold = coldCards(cards, contacts, tiers, today, timeZone);
  // A sensitive (DV/SA) organization never gets a note or one-pager nudge: their public line only.
  return cards
    .filter((c) => cold[c.id] && !c.sensitive && !opts.skip?.has(c.id))
    .sort((a, b) => TIER_ORDER[tiers[a.id].tier] - TIER_ORDER[tiers[b.id].tier] || cold[b.id].days - cold[a.id].days || a.name.localeCompare(b.name))
    .slice(0, Math.max(0, Math.min(max, COLD_NUDGES_PER_WEEK)))
    .map((c) => ({
      id: c.id,
      name: c.name,
      tier: opts.tierLabel?.[tiers[c.id].tier] ?? tiers[c.id].tier,
      weeks: cold[c.id].weeks,
      label: cold[c.id].label,
      cadence: cold[c.id].cadence,
      action: c.email ? NOTE_ACTION : ONE_PAGER_ACTION,
    }));
}

// ---- reciprocity and the people she refers to -------------------------------

export type Reciprocity = { theyReferred: number; youReferred: number; line: string };

/**
 * "They've referred N · You've referred M", from the log's dates and counts
 * only: each `referred` row is one person they sent her (inbound); each
 * `referred_out` row counts its people_count (outbound). Nothing about who.
 */
export function reciprocity(contacts: Pick<Contact, "kind" | "people_count">[]): Reciprocity {
  const theyReferred = contacts.filter((c) => c.kind === "referred").length;
  // The database requires a count on every referred_out row (migration 045).
  const youReferred = contacts.filter((c) => c.kind === "referred_out").reduce((n, c) => n + (c.people_count ?? 0), 0);
  return { theyReferred, youReferred, line: `They've referred ${theyReferred} · You've referred ${youReferred}` };
}

/** Her notes about someone she refers to: their availability, fees and insurance. Professional facts only. */
export type ReferOutNotes = { availability: string | null; fees: string | null; insurance: string | null };

export const REFER_OUT_LIMITS = { availability: 120, fees: 120, insurance: 200 } as const;
export const REFER_OUT_LABEL: Record<keyof ReferOutNotes, string> = {
  availability: "Their availability",
  fees: "Their fees",
  insurance: "Insurance they take",
};

export const hasReferOutNotes = (n: ReferOutNotes | undefined | null): boolean => Boolean(n && (n.availability || n.fees || n.insurance));

/** On her "People I refer to" list: she has referred someone to them, or saved notes about referring to them. */
export function refersTo(contacts: Pick<Contact, "kind">[], notes: ReferOutNotes | undefined | null): boolean {
  return contacts.some((c) => c.kind === "referred_out") || hasReferOutNotes(notes);
}
