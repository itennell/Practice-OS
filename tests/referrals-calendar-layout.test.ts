import { describe, expect, it } from "vitest";
import {
  addDays,
  blockBox,
  byDay,
  dayKey,
  gridHours,
  KIND_LABEL,
  KIND_MINUTES,
  KINDS,
  lanes,
  minutesInto,
  mondayOf,
  nextFreeStart,
  nowOffset,
  rangeLabel,
  stepAnchor,
  timeRangeLabel,
  viewDays,
  viewRange,
  visibleWeekDays,
  wallInstant,
  weekDays,
} from "@/components/referrals/calendar/layout";
import { DEFAULT_MINUTES, MEETING_KINDS, MEETING_LABEL } from "@/lib/referrals/meetings";

// Referrals › Calendar layout sums, on fixed dates in Chicago. US DST ends on
// Sun Nov 1, 2026 (CDT -5 → CST -6) and starts on Sun Mar 14, 2027.
const TZ = "America/Chicago";
const m = (starts: string, ends: string, status = "planned") => ({ starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(), status });

describe("the kinds match lib/referrals/meetings.ts", () => {
  it("same kinds, labels and usual lengths", () => {
    expect([...KINDS]).toEqual([...MEETING_KINDS]);
    expect(KIND_LABEL).toEqual(MEETING_LABEL);
    expect(KIND_MINUTES).toEqual(DEFAULT_MINUTES);
  });
});

describe("days and weeks", () => {
  it("a week runs Monday to Sunday", () => {
    expect(weekDays("2026-11-04")).toEqual(["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
    expect(mondayOf("2026-11-08")).toBe("2026-11-02"); // a Sunday belongs to the week before it
    expect(mondayOf("2026-11-02")).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("the week holding the fall DST change opens and closes at her midnights", () => {
    const r = viewRange("week", "2026-11-01", TZ);
    expect(r.from.toISOString()).toBe("2026-10-26T05:00:00.000Z"); // Mon midnight CDT
    expect(r.to.toISOString()).toBe("2026-11-02T06:00:00.000Z"); // next Mon midnight CST
    expect((r.to.getTime() - r.from.getTime()) / 3_600_000).toBe(7 * 24 + 1);
  });

  it("the spring week is an hour short", () => {
    const r = viewRange("week", "2027-03-14", TZ);
    expect(r.from.toISOString()).toBe("2027-03-08T06:00:00.000Z");
    expect(r.to.toISOString()).toBe("2027-03-15T05:00:00.000Z");
  });

  it("a day view is one day", () => {
    const r = viewRange("day", "2026-11-01", TZ);
    expect((r.to.getTime() - r.from.getTime()) / 3_600_000).toBe(25);
  });

  it("a month is whole weeks, Monday first", () => {
    const nov = viewDays("month", "2026-11-17");
    expect(nov[0]).toBe("2026-10-26");
    expect(nov.at(-1)).toBe("2026-12-06");
    expect(nov).toHaveLength(42);
    const feb = viewDays("month", "2027-02-10"); // Feb 1 2027 is a Monday, Feb 28 a Sunday
    expect(feb[0]).toBe("2027-02-01");
    expect(feb).toHaveLength(28);
    // Under the API's 62-day limit.
    const r = viewRange("month", "2026-11-17", TZ);
    expect((r.to.getTime() - r.from.getTime()) / 86_400_000).toBeLessThan(62);
  });

  it("steps back and forward by the view's unit", () => {
    expect(stepAnchor("week", "2026-11-04", 1)).toBe("2026-11-09");
    expect(stepAnchor("week", "2026-11-04", -1)).toBe("2026-10-26");
    expect(stepAnchor("day", "2026-11-01", 1)).toBe("2026-11-02");
    expect(stepAnchor("month", "2027-01-31", 1)).toBe("2027-02-01");
    expect(stepAnchor("month", "2027-01-31", -1)).toBe("2026-12-01");
  });

  it("labels the range", () => {
    expect(rangeLabel("week", "2026-11-04")).toBe("Nov 2 – 8, 2026");
    expect(rangeLabel("week", "2026-11-01")).toBe("Oct 26 – Nov 1, 2026");
    expect(rangeLabel("week", "2026-12-30")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(rangeLabel("day", "2026-11-03")).toBe("Tuesday, Nov 3, 2026");
    expect(rangeLabel("month", "2026-11-17")).toBe("November 2026");
  });
});

describe("blocks", () => {
  it("10:00 to 11:00 sits a fifth down an 8-to-6 grid and is a tenth tall", () => {
    const coffee = m("2026-11-05T16:00:00Z", "2026-11-05T17:00:00Z"); // 10-11 CST
    expect(blockBox(coffee, "2026-11-05", TZ)).toEqual({ top: 20, height: 10, minutes: 60, clippedTop: false, clippedBottom: false });
    expect(blockBox(coffee, "2026-11-04", TZ)).toBeNull();
    expect(timeRangeLabel(coffee, TZ)).toBe("10:00–11:00 am");
  });

  it("the wall clock places a block the same on a DST day", () => {
    // 10:00 CDT on Sat Oct 31 is 15:00Z; 10:00 CST on Sun Nov 1 is 16:00Z. Both sit at 10.
    expect(blockBox(m("2026-10-31T15:00:00Z", "2026-10-31T16:00:00Z"), "2026-10-31", TZ)?.top).toBe(20);
    expect(blockBox(m("2026-11-01T16:00:00Z", "2026-11-01T16:45:00Z"), "2026-11-01", TZ)).toMatchObject({ top: 20, height: 7.5, minutes: 45 });
    // Spring: 2:30 pm CDT on Sun Mar 14, 2027.
    expect(blockBox(m("2027-03-14T19:30:00Z", "2027-03-14T20:00:00Z"), "2027-03-14", TZ)).toMatchObject({ top: 65, height: 5 });
  });

  it("clips what runs past the grid's edges", () => {
    expect(blockBox(m("2026-11-05T13:00:00Z", "2026-11-05T15:00:00Z"), "2026-11-05", TZ)).toEqual({ top: 0, height: 10, minutes: 60, clippedTop: true, clippedBottom: false });
    expect(blockBox(m("2026-11-05T23:30:00Z", "2026-11-06T01:00:00Z"), "2026-11-05", TZ)).toMatchObject({ top: 95, clippedBottom: true });
  });

  it("widens the hours for an early or late meeting", () => {
    const early = m("2026-11-05T13:30:00Z", "2026-11-05T14:30:00Z"); // 7:30-8:30
    const late = m("2026-11-06T00:15:00Z", "2026-11-06T01:00:00Z"); // 6:15-7 pm on Nov 5
    expect(gridHours([early, late], ["2026-11-05"], TZ)).toEqual({ start: 7, end: 19 });
    expect(gridHours([], ["2026-11-05"], TZ)).toEqual({ start: 8, end: 18 });
    expect(blockBox(early, "2026-11-05", TZ, { start: 7, end: 19 })?.top).toBeCloseTo((30 / 720) * 100);
  });

  it("counts minutes from her midnight across days", () => {
    expect(minutesInto("2026-11-02T06:30:00Z", "2026-11-01", TZ)).toBe(1440 + 30);
    expect(minutesInto("2026-11-01T04:00:00Z", "2026-11-01", TZ)).toBe(-60); // 11 pm CDT Oct 31
  });

  it("puts overlapping blocks side by side", () => {
    const a = m("2026-11-05T16:00:00Z", "2026-11-05T17:00:00Z", "done");
    const b = m("2026-11-05T16:30:00Z", "2026-11-05T17:30:00Z");
    const c = m("2026-11-05T18:00:00Z", "2026-11-05T18:30:00Z");
    const out = lanes([c, b, a]);
    expect(out.map((o) => [o.item, o.lane, o.of])).toEqual([
      [a, 0, 2],
      [b, 1, 2],
      [c, 0, 1],
    ]);
  });
});

describe("the week's columns", () => {
  const days = weekDays("2026-11-04");
  it("are Mon to Fri when the weekend is free", () => {
    expect(visibleWeekDays(days, [m("2026-11-05T16:00:00Z", "2026-11-05T17:00:00Z")], TZ)).toEqual(days.slice(0, 5));
  });
  it("add Saturday when something falls on it", () => {
    const sat = m("2026-11-07T16:00:00Z", "2026-11-07T17:00:00Z");
    expect(visibleWeekDays(days, [sat], TZ)).toEqual(days.slice(0, 6));
    expect(byDay([sat], days, TZ).get("2026-11-07")).toEqual([sat]);
  });
});

describe("now and the form", () => {
  it("draws the now-line on today only, inside the hours", () => {
    const now = new Date("2026-11-03T19:00:00Z"); // 1 pm CST
    expect(nowOffset(now, "2026-11-03", TZ)).toBe(50);
    expect(nowOffset(now, "2026-11-04", TZ)).toBeNull();
    expect(nowOffset(new Date("2026-11-03T12:00:00Z"), "2026-11-03", TZ)).toBeNull(); // 6 am
  });

  it("turns a picked day and time into the right instant", () => {
    expect(wallInstant("2026-11-05", "10:00", TZ).toISOString()).toBe("2026-11-05T16:00:00.000Z");
    expect(wallInstant("2026-10-30", "10:00", TZ).toISOString()).toBe("2026-10-30T15:00:00.000Z");
    expect(dayKey("2026-11-03T05:30:00Z", TZ)).toBe("2026-11-02");
  });

  it("suggests a start an hour out on the quarter hour, or tomorrow at 9", () => {
    expect(nextFreeStart(new Date("2026-11-03T19:07:00Z"), TZ)).toEqual({ day: "2026-11-03", time: "14:15" });
    expect(nextFreeStart(new Date("2026-11-04T03:00:00Z"), TZ)).toEqual({ day: "2026-11-04", time: "09:00" }); // 9 pm
  });
});
