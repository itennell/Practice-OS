// Referrals CRM tabs (lib/referrals/crm-views.ts): where referrals come from (counts and
// dates only), how each was counted, the board's five columns and moves, its filters,
// the map's pins (none for a sensitive card) and the day-by-day timeline.
import { describe, expect, it } from "vitest";
import type { Contact } from "../lib/referrals/contacts";
import {
  addDays,
  boardMove,
  cardPins,
  columnFor,
  countedBy,
  dayHeading,
  dayIn,
  DEFAULT_BOARD_FILTERS,
  filterBoard,
  filterTimeline,
  groupByDay,
  latestActivity,
  letterCounts,
  meetingRange,
  practiceOptions,
  referralSourceBars,
  shortStep,
  timelineItems,
} from "../lib/referrals/crm-views";
import { meetingBlocked } from "../lib/referrals/meetings";
import { coldNudges } from "../lib/referrals/nurture";
import { partnerRows } from "../lib/referrals/partners";
import type { ReferralSource } from "../lib/referrals/store";
import type { TierResult } from "../lib/referrals/tier";

const TODAY = "2026-11-03";
const card = (over: Partial<ReferralSource>): ReferralSource => ({
  id: "c1", npi: null, name: "[Sample] Maria Rivera, MD", organization: null, taxonomy: "207Q00000X", specialty: "Family medicine", npi_type: "individual",
  credential: "MD", address: null, city: "Chicago", state: "IL", zip: "60614", phone: null, email: null, stage: "found", distance_miles: 0.5,
  fit_score: null, score_version: null, last_contacted_at: null, next_follow_up_on: null, notes: null, is_sample: true, ...over,
});
const tier = (category: number | null, t: TierResult["tier"] = "first"): TierResult => ({ tier: t, score: 50, reasons: ["x"], specialty: null, category });
let n = 0;
const log = (source_id: string, kind: Contact["kind"], happened_on: string, over: Partial<Contact> = {}): Contact => ({
  id: `k${++n}`, source_id, kind, happened_on, note: null, created_by: "clinician", is_sample: true, ...over,
});

const cards = [
  card({ id: "a", name: "[Sample] Juniper Row Family Medicine", organization: "[Sample] Juniper Row", npi_type: "organization", stage: "found" }),
  card({ id: "b", name: "[Sample] Dr. Ada Example", organization: "[Sample] Juniper Row", stage: "contacted", next_follow_up_on: TODAY }),
  card({ id: "c", name: "[Sample] Fernhollow Pediatrics", stage: "connected", npi_type: "organization", zip: "60657", next_follow_up_on: addDays(TODAY, 5) }),
  card({ id: "d", name: "[Sample] Grief Center", stage: "connected", specialty: "Grief centers", taxonomy: null, sensitive: true, zip: "60614" }),
  card({ id: "e", name: "[Sample] Set Aside Clinic", stage: "not_a_fit", zip: null }),
];
const tiers = { a: tier(1), b: tier(1), c: tier(1, "next"), d: tier(null, "later"), e: tier(3) };
const contacts: Record<string, Contact[]> = {
  c: [log("c", "referred", addDays(TODAY, -2)), log("c", "referred", addDays(TODAY, -40), { created_by: "aeon" }), log("c", "met", addDays(TODAY, -60), { note: "Coffee." })],
  d: [log("d", "referred", addDays(TODAY, -10)), log("d", "referred", addDays(TODAY, -200)), log("d", "met", addDays(TODAY, -3), { note: "They want evening slots." })],
  b: [log("b", "called", addDays(TODAY, -1), { note: "Left a message." })],
};

describe("where referrals come from", () => {
  it("counts 'they referred someone' per partner in the window, most first, dates only", () => {
    const { bars, total } = referralSourceBars(cards, contacts, tiers, { days: 90, by: "partner", today: TODAY });
    expect(total).toBe(3);
    expect(bars).toEqual([
      { key: "c", label: "[Sample] Fernhollow Pediatrics", count: 2, last: addDays(TODAY, -2) },
      { key: "d", label: "[Sample] Grief Center", count: 1, last: addDays(TODAY, -10) },
    ]);
  });

  it("the window is after today minus N days up to today; 365 days reaches further back", () => {
    expect(referralSourceBars(cards, contacts, tiers, { days: 30, by: "partner", today: TODAY }).total).toBe(2);
    expect(referralSourceBars(cards, contacts, tiers, { days: 365, by: "partner", today: TODAY }).total).toBe(4);
    const future = { x: [log("c", "referred", addDays(TODAY, 1))] };
    expect(referralSourceBars(cards, future, tiers, { days: 30, by: "partner", today: TODAY }).total).toBe(0);
  });

  it("by kind groups by the catalog category, else the specialty", () => {
    const { bars } = referralSourceBars(cards, contacts, tiers, { days: 365, by: "kind", today: TODAY });
    expect(bars.map((b) => [b.label, b.count])).toEqual([
      ["Primary care", 2],
      ["Grief centers", 2],
    ]);
  });

  it("how each was counted: she logged it, or Aeon logged it from the chat", () => {
    expect(countedBy(contacts, 90, TODAY)).toEqual({ clinician: 2, aeon: 1 });
    expect(countedBy(contacts, 30, TODAY)).toEqual({ clinician: 2, aeon: 0 });
  });

  it("letters: waiting for approval and approved but not sent; set-aside cards don't count", () => {
    const letters = {
      a: { approvalId: "1", status: "pending", subject: null, letter: null },
      b: { approvalId: "2", status: "done", subject: null, letter: null, sent: false },
      c: { approvalId: "3", status: "done", subject: null, letter: null, sent: true },
      e: { approvalId: "4", status: "pending", subject: null, letter: null },
    };
    expect(letterCounts(letters, cards)).toEqual({ waiting: 1, ready: 1 });
  });

  it("latest activity mixes her log and referral approvals, newest first", () => {
    const items = latestActivity(cards, contacts, [{ id: "ap", kind: "referral_letter", title: "Letter to [Sample] Juniper Row", status: "pending", created_at: `${TODAY}T15:00:00Z`, decided_at: null }], "America/Chicago", 3);
    expect(items.map((i) => [i.title, i.detail])).toEqual([
      ["Letter to [Sample] Juniper Row", "Waiting for your approval"],
      ["[Sample] Dr. Ada Example", "Called"],
      ["[Sample] Fernhollow Pediatrics", "They referred someone"],
    ]);
  });
});

describe("board columns", () => {
  it("maps the stages onto Found, Reached out, Met, Referring and Not a fit", () => {
    expect(cards.map((c) => columnFor(c, contacts[c.id] ?? []))).toEqual(["found", "reached_out", "referring", "referring", "not_a_fit"]);
    expect(columnFor(card({ stage: "follow_up" }), [])).toBe("reached_out");
    expect(columnFor(card({ stage: "connected" }), [log("x", "met", TODAY)])).toBe("met");
  });

  it("a drop sets the column's stage; into Referring logs a referral; Referring back to Met is explained", () => {
    expect(boardMove("found", "reached_out")).toEqual({ do: "stage", stage: "contacted" });
    expect(boardMove("reached_out", "met")).toEqual({ do: "stage", stage: "connected" });
    expect(boardMove("met", "not_a_fit")).toEqual({ do: "stage", stage: "not_a_fit" });
    expect(boardMove("met", "referring")).toEqual({ do: "log_referral" });
    expect(boardMove("referring", "met")).toEqual({ do: "explain" });
    // Every move out of Referring is explained, never done by a drag.
    expect(boardMove("referring", "found")).toEqual({ do: "explain" });
    expect(boardMove("referring", "not_a_fit")).toEqual({ do: "explain" });
    expect(boardMove("referring", "reached_out")).toEqual({ do: "explain" });
    // A Not a fit card dropped on Referring is refused: no referral is logged.
    expect(boardMove("not_a_fit", "referring")).toEqual({ do: "refuse" });
    expect(boardMove("found", "referring")).toEqual({ do: "log_referral" });
    expect(boardMove("met", "met")).toEqual({ do: "none" });
  });

  const rows = partnerRows(cards, tiers, contacts, {});
  it("filters: practice, person, follow-up due, email; Not a fit stays on the board", () => {
    expect(filterBoard(rows, DEFAULT_BOARD_FILTERS, TODAY).map((r) => r.card.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, practices: ["[Sample] Juniper Row"] }, TODAY).map((r) => r.card.id)).toEqual(["a", "b"]);
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, person: "people" }, TODAY).map((r) => r.card.id)).toEqual(["b", "d", "e"]);
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, person: "places" }, TODAY).map((r) => r.card.id)).toEqual(["a", "c"]);
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, followUp: "due" }, TODAY).map((r) => r.card.id)).toEqual(["b"]);
    // Connected cards have no follow-up due on the board.
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, followUp: "week" }, TODAY).map((r) => r.card.id)).toEqual(["b"]);
    expect(filterBoard(rows, { ...DEFAULT_BOARD_FILTERS, query: "fernhollow" }, TODAY).map((r) => r.card.id)).toEqual(["c"]);
  });

  it("practice options count cards per practice", () => {
    expect(practiceOptions(rows)).toEqual([
      { value: "[Sample] Fernhollow Pediatrics", label: "[Sample] Fernhollow Pediatrics", count: 1 },
      { value: "[Sample] Juniper Row", label: "[Sample] Juniper Row", count: 2 },
    ]);
  });

  it("a short next step keeps the first sentence", () => {
    expect(shortStep("Follow up now: a short check-in.")).toBe("Follow up now.");
    expect(shortStep("Draft a short introduction letter, approve it, and send it from your own email.")).toBe("Draft a short introduction letter.");
    expect(shortStep("Wait a week for a reply, then follow up.")).toBe("Wait a week for a reply, then follow up.");
    expect(shortStep("Set aside. Aeon won't suggest them.")).toBe("Set aside.");
  });
});

describe("map pins", () => {
  it("pins at the ZIP center; never a pin for a sensitive card or one without a ZIP", () => {
    const pins = cardPins(cards, { "60614": [41.92, -87.65], "60657": [41.94, -87.65] }, tiers);
    expect(pins.map((p) => p.id)).toEqual(["a", "b", "c"]);
    expect(pins[2]).toMatchObject({ lat: 41.94, lon: -87.65, tier: "next" });
  });
});

describe("timeline", () => {
  const meetings = [
    { id: "m1", source_id: "c", source_name: "x", kind: "coffee", starts_at: `${addDays(TODAY, 2)}T15:00:00Z`, status: "planned", location: "[Sample] Cafe" },
    { id: "m2", source_id: "b", source_name: "x", kind: "call", starts_at: `${addDays(TODAY, -1)}T20:00:00Z`, status: "canceled", location: null },
  ];
  const withSummary = cards.map((c) => (c.id === "d" ? { ...c, last_meeting_summary: "They want evening slots." } : c));
  const items = timelineItems(withSummary, contacts, meetings, { timeZone: "America/Chicago", now: new Date(`${TODAY}T12:00:00Z`) });

  it("log entries and meetings; canceled meetings are left out; a referral never has a note", () => {
    expect(items.some((i) => i.id === "m-m2")).toBe(false);
    const planned = items.find((i) => i.id === "m-m1")!;
    expect(planned).toMatchObject({ kind: "meeting", day: addDays(TODAY, 2), planned: true, note: "At [Sample] Cafe" });
    expect(planned.label).toMatch(/^Coffee at 9:00\sAM \(planned\)$/);
    expect(items.filter((i) => i.kind === "referral").every((i) => i.note === null)).toBe(true);
  });

  it("a met entry holding the debrief summary reads as the debrief", () => {
    const met = items.find((i) => i.sourceId === "d" && i.kind === "meeting")!;
    expect(met).toMatchObject({ debrief: true, label: "Met: your debrief" });
    expect(items.find((i) => i.sourceId === "c" && i.label === "Met")!.debrief).toBe(false);
  });

  it("filters by type and partner, and groups by day, newest first", () => {
    expect(filterTimeline(items, "call", "all").map((i) => i.sourceId)).toEqual(["b"]);
    expect(filterTimeline(items, "all", "d").every((i) => i.sourceId === "d")).toBe(true);
    const days = groupByDay(items).map((g) => g.day);
    expect(days[0]).toBe(addDays(TODAY, 2));
    expect([...days].sort().reverse()).toEqual(days);
    expect(new Set(days).size).toBe(days.length);
  });

  it("day headings and the meetings range", () => {
    expect(dayHeading(TODAY, TODAY)).toBe("Today");
    expect(dayHeading(addDays(TODAY, -1), TODAY)).toBe("Yesterday");
    expect(dayHeading("2026-10-30", TODAY)).toBe("Friday, Oct 30");
    expect(dayHeading("2025-10-30", TODAY)).toBe("Thursday, Oct 30, 2025");
    // Day starts in her zone: Chicago is UTC-5 in September (CDT) and UTC-6 after Nov 1 (CST).
    expect(meetingRange(TODAY, 54, 7, "America/Chicago")).toEqual({ from: "2026-09-10T05:00:00.000Z", to: "2026-11-11T06:00:00.000Z" });
    expect(meetingRange(TODAY, 0, 0, "America/Los_Angeles")).toEqual({ from: "2026-11-03T08:00:00.000Z", to: "2026-11-04T08:00:00.000Z" });
    expect(meetingRange(TODAY, 0, 0, "UTC")).toEqual({ from: "2026-11-03T00:00:00.000Z", to: "2026-11-04T00:00:00.000Z" });
  });
});

describe("final review fixes", () => {
  it("dayIn reads database and ISO times in her zone, and never shows Invalid Date", () => {
    expect(dayIn("America/Chicago", "2026-11-03T03:00:00Z")).toBe("2026-11-02");
    expect(dayIn("America/Chicago", "2026-11-03 15:00:00+00")).toBe("2026-11-03");
    expect(dayIn("America/Chicago", "not a date")).toBe("");
    expect(dayIn("America/Chicago", null)).toBe("");
    // An approval with an unreadable date is left out of Latest activity, not shown as "Invalid Date".
    const items = latestActivity([], {}, [{ id: "x", kind: "referral_letter", title: "t", status: "done", created_at: "garbage", decided_at: null }], "America/Chicago");
    expect(items).toEqual([]);
  });

  it("going-cold nudges never include a sensitive card", () => {
    const old = (id: string, sensitive: boolean) => ({ id, name: `[Sample] ${id}`, email: null, stage: "connected" as const, last_contacted_at: "2025-01-01T12:00:00Z", sensitive });
    const nudges = coldNudges([old("shelter", true), old("clinic", false)], {}, { shelter: { tier: "first" }, clinic: { tier: "first" } }, TODAY, "America/Chicago");
    expect(nudges.map((n) => n.id)).toEqual(["clinic"]);
  });

  it("no meeting is planned with a sensitive card (checked before any database read)", async () => {
    const said = await meetingBlocked({ name: "[Sample] Safe Harbor", npi: null, stage: "found", sensitive: true }, {} as never);
    expect(said).toMatch(/public line only/);
  });
});
