// The Referrals CRM tabs (Overview, Board, Map, Meetings and notes) in plain code:
// where referrals come from, how each was counted, the board's five columns and
// its filters, the map's pins, and the day-by-day timeline. Pure and small, so
// the tabs (client) and the tests share it. "They referred someone" rows carry a
// date only: nothing here ever reads or shows who a client was.
import { CATEGORY_LABELS } from "./categories";
import { CONTACT_LABEL, type ContactKind } from "./contact-kinds";
import type { Contact } from "./contacts";
import { filterPartners, DEFAULT_FILTERS, type DistanceFilter, type EmailFilter, type PartnerRow } from "./partners";
import type { Stage } from "./stages";
import type { LetterState, ReferralSource } from "./store";
import type { Tier, TierResult } from "./tier";

// ---- days ----------------------------------------------------------------

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The day (YYYY-MM-DD) an instant falls on in the practice's time zone. */
export function dayIn(timeZone: string, at: string | Date): string {
  const d = typeof at === "string" ? new Date(at) : at;
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** "Today", "Yesterday", "Tuesday, Nov 3" (this year) or "Tuesday, Nov 3, 2025". */
export function dayHeading(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === addDays(today, -1)) return "Yesterday";
  if (day === addDays(today, 1)) return "Tomorrow";
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric", ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }) });
}

// ---- Overview: where referrals come from -----------------------------------

export const SOURCE_WINDOWS = ["30", "90", "365"] as const;
export type SourceWindow = (typeof SOURCE_WINDOWS)[number];
export const SOURCE_WINDOW_OPTIONS: { value: SourceWindow; label: string }[] = [
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last 365 days" },
];
export type SourceGroup = "partner" | "kind";
export const SOURCE_GROUP_OPTIONS: { value: SourceGroup; label: string }[] = [
  { value: "partner", label: "By partner" },
  { value: "kind", label: "By kind" },
];

export type SourceBar = { key: string; label: string; count: number; last: string };

type RefBits = Pick<Contact, "kind" | "happened_on" | "source_id"> & Partial<Pick<Contact, "created_by">>;

/** "They referred someone" rows in the window: after today minus `days`, up to today (crm.ts counts the same way). */
export function referredIn(contacts: Record<string, RefBits[] | undefined>, days: number, today: string): RefBits[] {
  const from = addDays(today, -days);
  return Object.values(contacts)
    .flatMap((list) => list ?? [])
    .filter((c) => c.kind === "referred" && c.happened_on > from && c.happened_on <= today);
}

/** The kind of partner a card is: the catalog category's name, else its specialty. */
export function kindLabel(card: Pick<ReferralSource, "specialty" | "taxonomy">, tier: Pick<TierResult, "category"> | undefined): string {
  const category = tier?.category ?? null;
  return (category && CATEGORY_LABELS[category]) || card.specialty || card.taxonomy || "Other";
}

/**
 * One bar per partner (or per kind of partner) that referred someone in the window,
 * most first. Counts and dates only.
 */
export function referralSourceBars(
  cards: Pick<ReferralSource, "id" | "name" | "specialty" | "taxonomy">[],
  contacts: Record<string, RefBits[] | undefined>,
  tiers: Record<string, Pick<TierResult, "category"> | undefined>,
  opts: { days: number; by: SourceGroup; today: string },
): { bars: SourceBar[]; total: number } {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const bars = new Map<string, SourceBar>();
  let total = 0;
  for (const r of referredIn(contacts, opts.days, opts.today)) {
    const card = byId.get(r.source_id);
    if (!card) continue;
    total++;
    const key = opts.by === "partner" ? card.id : kindLabel(card, tiers[card.id]);
    const label = opts.by === "partner" ? card.name : key;
    const bar = bars.get(key) ?? { key, label, count: 0, last: r.happened_on };
    bar.count++;
    if (r.happened_on > bar.last) bar.last = r.happened_on;
    bars.set(key, bar);
  }
  return { bars: [...bars.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last) || a.label.localeCompare(b.label)), total };
}

/** How each referral in the window was counted: she logged it, or Aeon logged it for her from the chat. */
export function countedBy(contacts: Record<string, RefBits[] | undefined>, days: number, today: string): { clinician: number; aeon: number } {
  const rows = referredIn(contacts, days, today);
  return { clinician: rows.filter((r) => r.created_by !== "aeon").length, aeon: rows.filter((r) => r.created_by === "aeon").length };
}

/** Letters waiting for her approval, and approved letters she hasn't marked sent. */
export function letterCounts(letters: Record<string, LetterState | undefined>, cards: Pick<ReferralSource, "id" | "stage">[]): { waiting: number; ready: number } {
  let waiting = 0;
  let ready = 0;
  for (const c of cards) {
    const l = letters[c.id];
    if (!l || c.stage === "not_a_fit") continue;
    if (l.status === "pending" || l.status === "running") waiting++;
    else if (l.status === "done" && !l.sent) ready++;
  }
  return { waiting, ready };
}

// ---- Overview: latest activity ---------------------------------------------

export type ApprovalBits = { id: string; kind: string; title: string; status: string; created_at: string; decided_at: string | null };
export type ActivityItem = { id: string; day: string; sourceId: string | null; title: string; detail: string; kind: "contact" | "approval" };

const APPROVAL_STATUS: Record<string, string> = {
  pending: "Waiting for your approval",
  running: "Being saved",
  done: "Approved",
  failed: "Didn't go through",
  rejected: "Declined",
};

/** Her newest log entries and referral approvals, newest first. */
export function latestActivity(
  cards: Pick<ReferralSource, "id" | "name">[],
  contacts: Record<string, Pick<Contact, "id" | "kind" | "happened_on" | "source_id">[] | undefined>,
  approvals: ApprovalBits[],
  timeZone: string,
  max = 8,
): ActivityItem[] {
  const names = new Map(cards.map((c) => [c.id, c.name]));
  const fromLog: ActivityItem[] = Object.values(contacts)
    .flatMap((l) => l ?? [])
    .filter((c) => names.has(c.source_id))
    .map((c) => ({ id: c.id, day: c.happened_on, sourceId: c.source_id, title: names.get(c.source_id)!, detail: CONTACT_LABEL[c.kind], kind: "contact" as const }));
  const fromApprovals: ActivityItem[] = approvals.map((a) => ({
    id: a.id,
    day: dayIn(timeZone, a.decided_at ?? a.created_at),
    sourceId: null,
    title: a.title,
    detail: APPROVAL_STATUS[a.status] ?? a.status,
    kind: "approval" as const,
  }));
  return [...fromLog, ...fromApprovals].sort((a, b) => b.day.localeCompare(a.day)).slice(0, max);
}

// ---- Board: five columns -----------------------------------------------------

export const BOARD_COLUMNS = ["found", "reached_out", "met", "referring", "not_a_fit"] as const;
export type BoardColumn = (typeof BOARD_COLUMNS)[number];
export const COLUMN_LABEL: Record<BoardColumn, string> = {
  found: "Found",
  reached_out: "Reached out",
  met: "Met",
  referring: "Referring",
  not_a_fit: "Not a fit",
};

/**
 * Which column a card sits in. The stages are found, contacted, follow_up, connected
 * and not_a_fit (lib/referrals/stages.ts): Reached out is contacted and follow up;
 * connected (met or replied) is Met, or Referring once they have referred someone.
 */
export function columnFor(card: Pick<ReferralSource, "stage">, contacts: Pick<Contact, "kind">[]): BoardColumn {
  switch (card.stage) {
    case "found":
      return "found";
    case "contacted":
    case "follow_up":
      return "reached_out";
    case "connected":
      return contacts.some((c) => c.kind === "referred") ? "referring" : "met";
    default:
      return "not_a_fit";
  }
}

/** The stage a card dropped in a column gets. Referring is connected plus a logged referral. */
export const COLUMN_STAGE: Record<BoardColumn, Stage> = {
  found: "found",
  reached_out: "contacted",
  met: "connected",
  referring: "connected",
  not_a_fit: "not_a_fit",
};

export type BoardMove =
  | { do: "none" }
  | { do: "stage"; stage: Stage }
  /** Into Referring: she confirms, and a dated "they referred someone" entry is logged (which also makes it connected). */
  | { do: "log_referral" }
  /** Out of Referring into Met: the referral is in her log, so the card can't leave it by a drag. */
  | { do: "explain" };

export function boardMove(from: BoardColumn, to: BoardColumn): BoardMove {
  if (from === to) return { do: "none" };
  if (to === "referring") return { do: "log_referral" };
  if (from === "referring" && to === "met") return { do: "explain" };
  return { do: "stage", stage: COLUMN_STAGE[to] };
}

// ---- Board: filters ------------------------------------------------------------

export type PersonFilter = "all" | "people" | "places";
export type FollowUpFilter = "all" | "due" | "week";
export type BoardView = "board" | "cold" | "refer_out";

export type BoardFilters = {
  query: string;
  /** Practice names (card.organization); none means every practice. */
  practices: string[];
  person: PersonFilter;
  kinds: string[];
  email: EmailFilter;
  followUp: FollowUpFilter;
  distance: DistanceFilter;
};

export const DEFAULT_BOARD_FILTERS: BoardFilters = { query: "", practices: [], person: "all", kinds: [], email: "all", followUp: "all", distance: "any" };

export const PERSON_OPTIONS: { value: PersonFilter; label: string }[] = [
  { value: "all", label: "Anyone" },
  { value: "people", label: "People" },
  { value: "places", label: "Offices and places" },
];
export const FOLLOW_UP_OPTIONS: { value: FollowUpFilter; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "due", label: "Due now" },
  { value: "week", label: "Due this week" },
];
export const VIEW_OPTIONS: { value: BoardView; label: string }[] = [
  { value: "board", label: "Whole board" },
  { value: "cold", label: "Going cold" },
  { value: "refer_out", label: "People I refer to" },
];

const bare = (s: string) => s.replace(/^\[Sample\]\s*/, "");

/** The practice a card belongs to: its organization, or its own name for an office or place. */
export function practiceOf(card: Pick<ReferralSource, "organization" | "name" | "npi_type">): string | null {
  return card.organization?.trim() || (card.npi_type === "organization" ? card.name : null);
}

export function practiceOptions(rows: Pick<PartnerRow, "card">[]): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { card } of rows) {
    const p = practiceOf(card);
    if (p) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => bare(a[0]).localeCompare(bare(b[0]))).map(([p, count]) => ({ value: p, label: p, count }));
}

/** The board's search and filters. Not a fit stays in its own column. Order: the board's (rankCards). */
export function filterBoard(rows: PartnerRow[], f: BoardFilters, today: string): PartnerRow[] {
  const base = filterPartners(rows, { ...DEFAULT_FILTERS, query: f.query, kinds: f.kinds, email: f.email, distance: f.distance, showNotAFit: true });
  const weekEnd = addDays(today, 7);
  return base.filter(({ card }) => {
    if (f.practices.length) {
      const p = practiceOf(card);
      if (!p || !f.practices.includes(p)) return false;
    }
    if (f.person === "people" && card.npi_type === "organization") return false;
    if (f.person === "places" && card.npi_type !== "organization") return false;
    if (f.followUp !== "all") {
      const on = card.stage === "connected" || card.stage === "not_a_fit" ? null : card.next_follow_up_on;
      if (!on || on > (f.followUp === "due" ? today : weekEnd)) return false;
    }
    return true;
  });
}

/** A short next-step line for a compact card (partners.ts nextStep, cut to its first sentence). */
export function shortStep(step: string): string {
  const first = step.split(/(?<=[.:])\s/)[0] ?? step;
  return first.endsWith(":") ? `${first.slice(0, -1)}.` : first;
}

// ---- Map -----------------------------------------------------------------------

export type CardPin = { id: string; name: string; lat: number; lon: number; tier: Tier };

/**
 * Pins at each card's ZIP center (the Census ZCTA centers). A sensitive card (a DV/SA
 * agency or shelter) never gets a pin, and nor does a card with no ZIP.
 */
export function cardPins(
  cards: Pick<ReferralSource, "id" | "name" | "zip" | "sensitive">[],
  centers: Record<string, [number, number] | undefined>,
  tiers: Record<string, Pick<TierResult, "tier"> | undefined>,
): CardPin[] {
  return cards.flatMap((c) => {
    if (c.sensitive || !c.zip) return [];
    const at = centers[c.zip.slice(0, 5)];
    return at ? [{ id: c.id, name: c.name, lat: at[0], lon: at[1], tier: tiers[c.id]?.tier ?? "later" }] : [];
  });
}

// ---- Meetings and notes: the timeline ------------------------------------------------

export type TimelineKind = "meeting" | "call" | "letter" | "referral" | "note";
export type TimelineFilter = "all" | TimelineKind;
export const TIMELINE_FILTER_OPTIONS: { value: TimelineFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "meeting", label: "Meetings" },
  { value: "call", label: "Calls" },
  { value: "letter", label: "Letters" },
  { value: "referral", label: "Referrals" },
  { value: "note", label: "Notes" },
];

export const KIND_GROUP: Record<ContactKind, TimelineKind> = {
  met: "meeting",
  called: "call",
  emailed: "letter",
  sent_letter: "letter",
  replied: "letter",
  referred: "referral",
  referred_out: "referral",
  note: "note",
};

/** A meeting from the calendar (GET /api/referrals/meetings): only what the timeline needs. */
export type MeetingBits = { id: string; source_id: string; source_name: string; kind: string; starts_at: string; status: string; location: string | null; notes?: string | null };

export const MEETING_WORD: Record<string, string> = { coffee: "Coffee", call: "Call", meeting: "Meeting", lunch_talk: "Lunch talk", other: "Meeting" };

export type TimelineItem = {
  id: string;
  day: string;
  /** For ordering inside a day: an instant for a meeting, else empty. */
  at: string;
  sourceId: string;
  name: string;
  kind: TimelineKind;
  label: string;
  note: string | null;
  /** A debrief she recorded after the meeting (saved as a "met" entry with its summary). */
  debrief: boolean;
  /** A meeting still ahead. */
  planned: boolean;
};

export function timelineItems(
  cards: Pick<ReferralSource, "id" | "name" | "last_meeting_summary">[],
  contacts: Record<string, Pick<Contact, "id" | "kind" | "happened_on" | "source_id" | "note" | "people_count">[] | undefined>,
  meetings: MeetingBits[],
  opts: { timeZone: string; now?: Date },
): TimelineItem[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const now = opts.now ?? new Date();
  const fromLog = Object.values(contacts)
    .flatMap((l) => l ?? [])
    .flatMap((c): TimelineItem[] => {
      const card = byId.get(c.source_id);
      if (!card) return [];
      const summary = card.last_meeting_summary ?? null;
      const debrief = c.kind === "met" && Boolean(c.note && summary && summary.slice(0, 500) === c.note);
      const count = c.kind === "referred_out" && c.people_count ? ` (${c.people_count})` : "";
      return [
        {
          id: `c-${c.id}`,
          day: c.happened_on,
          at: "",
          sourceId: c.source_id,
          name: card.name,
          kind: KIND_GROUP[c.kind],
          label: debrief ? "Met: your debrief" : `${CONTACT_LABEL[c.kind]}${count}`,
          // "They referred someone" never has a note (migration 024); nothing about a client shows.
          note: c.kind === "referred" ? null : c.note,
          debrief,
          planned: false,
        },
      ];
    });
  const fromCalendar = meetings
    .filter((m) => m.status !== "canceled" && byId.has(m.source_id))
    .map((m): TimelineItem => {
      const planned = new Date(m.starts_at) > now && m.status === "planned";
      const time = new Date(m.starts_at).toLocaleTimeString("en-US", { timeZone: opts.timeZone, hour: "numeric", minute: "2-digit" });
      return {
        id: `m-${m.id}`,
        day: dayIn(opts.timeZone, m.starts_at),
        at: m.starts_at,
        sourceId: m.source_id,
        name: byId.get(m.source_id)?.name ?? m.source_name,
        kind: "meeting",
        label: `${MEETING_WORD[m.kind] ?? "Meeting"} at ${time}${planned ? " (planned)" : ""}`,
        note: m.location ? `At ${m.location}` : null,
        debrief: false,
        planned,
      };
    });
  return [...fromLog, ...fromCalendar];
}

export function filterTimeline(items: TimelineItem[], kind: TimelineFilter, partner: string): TimelineItem[] {
  return items.filter((i) => (kind === "all" || i.kind === kind) && (partner === "all" || i.sourceId === partner));
}

/** Newest day first; inside a day, meetings by time (latest first), then the log. */
export function groupByDay(items: TimelineItem[]): { day: string; items: TimelineItem[] }[] {
  const days = new Map<string, TimelineItem[]>();
  for (const i of items) days.set(i.day, [...(days.get(i.day) ?? []), i]);
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, list]) => ({ day, items: [...list].sort((a, b) => b.at.localeCompare(a.at)) }));
}

/** The meetings API range around today: what the timeline and "This week" ask for (62 days at most). */
export function meetingRange(today: string, back: number, ahead: number): { from: string; to: string } {
  return { from: `${addDays(today, -back)}T00:00:00Z`, to: `${addDays(today, ahead)}T23:59:59Z` };
}
