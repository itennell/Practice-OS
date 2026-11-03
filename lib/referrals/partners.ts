// The Partners table (Referrals › Partners): one row per board card, and the search,
// filters and sort over it. Pure, so the page and the tests share it.
import { CATEGORY_LABELS } from "./categories";
import type { Contact } from "./contacts";
import { STAGES, STAGE_LABEL, type Stage } from "./stages";
import type { LetterState, ReferralSource } from "./store";
import type { TierResult } from "./tier";

export type EmailFilter = "all" | "has" | "missing";
export type DistanceFilter = "any" | "1" | "3" | "5" | "10";
export type PartnerSort = "best" | "nearest" | "name" | "last_contact" | "stage";

export type PartnerFilters = {
  query: string;
  /** Catalog categories (as strings); none means every kind. */
  kinds: string[];
  /** None means every stage. */
  stages: Stage[];
  email: EmailFilter;
  distance: DistanceFilter;
  sort: PartnerSort;
  showNotAFit: boolean;
};

export const DEFAULT_FILTERS: PartnerFilters = { query: "", kinds: [], stages: [], email: "all", distance: "any", sort: "best", showNotAFit: false };

export const SORT_OPTIONS: { value: PartnerSort; label: string }[] = [
  { value: "best", label: "Best fit first" },
  { value: "nearest", label: "Nearest first" },
  { value: "last_contact", label: "Longest since contact" },
  { value: "stage", label: "Stage" },
  { value: "name", label: "Name (A to Z)" },
];
export const EMAIL_OPTIONS: { value: EmailFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "has", label: "Has email" },
  { value: "missing", label: "Missing email" },
];
export const DISTANCE_OPTIONS: { value: DistanceFilter; label: string }[] = [
  { value: "any", label: "Any distance" },
  { value: "1", label: "Within 1 mi" },
  { value: "3", label: "Within 3 mi" },
  { value: "5", label: "Within 5 mi" },
  { value: "10", label: "Within 10 mi" },
];

export type PartnerRow = {
  card: ReferralSource;
  /** The email on the card: hers wins, else the one Aeon found on their website. */
  email: string | null;
  /** The catalog category's name ("Primary care"), else the card's specialty. */
  kind: string;
  category: number | null;
  /** Their last logged contact (a day), else the card's last contacted date. */
  lastContact: string | null;
  /** Position in the board's one order (plan.ts rankCards). */
  rank: number;
};

/** The rows, in the board's order (cards already ranked by rankCards). */
export function partnerRows(
  cards: ReferralSource[],
  tiers: Record<string, TierResult | undefined>,
  contacts: Record<string, Contact[] | undefined>,
  emails: Record<string, string | null | undefined>,
): PartnerRow[] {
  return cards.map((card, rank) => {
    const category = tiers[card.id]?.category ?? null;
    const log = contacts[card.id] ?? [];
    return {
      card,
      email: emails[card.id] ?? card.email ?? null,
      kind: (category && CATEGORY_LABELS[category]) || card.specialty || card.taxonomy || "Other",
      category,
      lastContact: log[0]?.happened_on ?? card.last_contacted_at?.slice(0, 10) ?? null,
      rank,
    };
  });
}

const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function filterPartners(rows: PartnerRow[], f: PartnerFilters): PartnerRow[] {
  const q = fold(f.query.trim());
  const max = f.distance === "any" ? null : Number(f.distance);
  const kept = rows.filter(({ card, email, kind, category }) => {
    if (card.stage === "not_a_fit" && !f.showNotAFit && !f.stages.includes("not_a_fit")) return false;
    if (f.stages.length && !f.stages.includes(card.stage)) return false;
    if (f.kinds.length && !(category !== null && f.kinds.includes(String(category)))) return false;
    if (f.email === "has" && !email) return false;
    if (f.email === "missing" && email) return false;
    if (max !== null && (card.distance_miles === null || card.distance_miles > max)) return false;
    if (q) {
      const hay = fold([card.name, card.organization, kind, card.specialty, card.city, card.zip, email, card.phone].filter(Boolean).join(" "));
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const by: Record<PartnerSort, (a: PartnerRow, b: PartnerRow) => number> = {
    best: (a, b) => a.rank - b.rank,
    nearest: (a, b) => (a.card.distance_miles ?? Infinity) - (b.card.distance_miles ?? Infinity) || a.rank - b.rank,
    name: (a, b) => a.card.name.replace(/^\[Sample\]\s*/, "").localeCompare(b.card.name.replace(/^\[Sample\]\s*/, "")),
    // Never contacted first, then the longest since.
    last_contact: (a, b) => (a.lastContact ?? "").localeCompare(b.lastContact ?? "") || a.rank - b.rank,
    stage: (a, b) => STAGES.indexOf(a.card.stage) - STAGES.indexOf(b.card.stage) || a.rank - b.rank,
  };
  return [...kept].sort(by[f.sort]);
}

/** The Kind menu: the categories on her board, in category order, with counts. */
export function kindOptions(rows: PartnerRow[]): { value: string; label: string; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of rows) if (r.category && CATEGORY_LABELS[r.category]) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([id, count]) => ({ value: String(id), label: CATEGORY_LABELS[id], count }));
}

export function stageOptions(rows: PartnerRow[], showNotAFit: boolean): { value: Stage; label: string; count: number }[] {
  return STAGES.filter((s) => showNotAFit || s !== "not_a_fit").map((s) => ({ value: s, label: STAGE_LABEL[s], count: rows.filter((r) => r.card.stage === s).length }));
}

/** "0.6 mi", "in your ZIP", or null. */
export function distanceLabel(miles: number | null): string | null {
  if (miles === null) return null;
  return miles < 0.1 ? "in your ZIP" : `${miles} mi`;
}

/** "Nov 3" (this year) or "Nov 3, 2025". */
export function dayLabel(iso: string | null, today: string): string {
  if (!iso) return "Never";
  const d = new Date(`${iso}T12:00:00`);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

/** What to do next with a partner, in one plain line (the plan's wording). */
export function nextStep(card: ReferralSource, opts: { email: string | null; letterWaiting: boolean; cold: boolean; today: string }): string {
  if (card.stage === "not_a_fit") return "Set aside. Aeon won't suggest them.";
  if (opts.letterWaiting) return "A letter is waiting: approve it in Approvals, then copy and send it yourself.";
  if (card.next_follow_up_on && card.stage !== "connected") {
    return card.next_follow_up_on <= opts.today ? "Follow up now: a short check-in." : `Follow up on ${dayLabel(card.next_follow_up_on, opts.today)}.`;
  }
  if (opts.cold) return "Going cold: send a short keep-in-touch note.";
  if (card.stage === "connected") return "Keep in touch, and log it when they refer someone.";
  if (card.introduced_by) return `Ask ${card.introduced_by} to introduce you, then draft a short letter.`;
  if (card.stage === "found")
    return opts.email ? "Draft a short introduction letter, approve it, and send it from your own email." : "Call the office, ask who handles referrals, then send a short letter.";
  return "Wait a week for a reply, then follow up.";
}

/** A letter waiting for her approval, or approved and not marked sent (plan.ts letterWaiting, without the database). */
export function letterIsWaiting(l: LetterState | undefined): boolean {
  return Boolean(l && (l.status === "pending" || l.status === "running" || (l.status === "done" && !l.sent)));
}
