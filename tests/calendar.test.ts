import { describe, expect, it } from "vitest";
import { dayKey, dayLabel, groupByDay } from "../components/shared/calendar-labels";

describe("calendar labels", () => {
  it("names the day, today and what is due", () => {
    const d = new Date(2027, 2, 31);
    expect(dayLabel(d, [{ date: d, kind: "deadline", label: "license renewal due" }], { today: true })).toBe(
      "Wednesday, March 31, 2027, today: license renewal due",
    );
  });

  it("joins several things on one day", () => {
    const d = new Date(2026, 10, 4);
    expect(
      dayLabel(d, [
        { date: d, kind: "deadline", label: "CAQH re-attestation due" },
        { date: d, kind: "consult", label: "consult at 2 pm" },
      ]),
    ).toBe("Wednesday, November 4, 2026: CAQH re-attestation due; consult at 2 pm");
  });

  it("keys days in local time so a date string and a Date agree", () => {
    expect(dayKey(new Date(2026, 10, 4, 23, 30))).toBe("2026-11-04");
    expect(dayKey("2026-11-04")).toBe("2026-11-04");
    expect(groupByDay([{ date: "2026-11-04", kind: "post", label: "post" }, { date: new Date(2026, 10, 4), kind: "done", label: "done" }]).get("2026-11-04")).toHaveLength(2);
  });
});
