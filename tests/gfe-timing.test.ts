// Good Faith Estimate timing, 45 CFR 149.610(b)(1)(vi). Expected dates were
// worked out by hand on a 2026 calendar (Veterans Day Wed Nov 11, Thanksgiving
// Thu Nov 26), not by the code under test.
import { describe, expect, it } from "vitest";
import { federalHolidays, legalHolidays } from "../lib/compliance/dates";
import { DANA_OPEN_DAYS } from "../lib/gfe/demo";
import { WEEKDAYS, addOpenDays, gfeDueDate, isOpen, openDaysBetween } from "../lib/gfe/timing";

const dana = DANA_OPEN_DAYS; // Mon-Thu, closed federal holidays [Sample]

describe("open days", () => {
  it("federal holidays drop DC Emancipation Day but keep the rest", () => {
    expect(legalHolidays(2026).has("2026-04-16")).toBe(true);
    expect(federalHolidays(2026).has("2026-04-16")).toBe(false);
    expect(federalHolidays(2026).has("2026-11-11")).toBe(true);
    expect(federalHolidays(2026).has("2026-11-26")).toBe(true);
  });

  it("Dana is closed Fridays, weekends and federal holidays", () => {
    expect(isOpen("2026-11-12", dana)).toBe(true); // Thu
    expect(isOpen("2026-11-13", dana)).toBe(false); // Fri
    expect(isOpen("2026-11-11", dana)).toBe(false); // Veterans Day
    expect(isOpen("2026-11-26", dana)).toBe(false); // Thanksgiving
    expect(isOpen("2026-11-28", dana)).toBe(false); // Sat
  });

  it("extra closure dates count as closed", () => {
    const vacation = { ...dana, closedOn: ["2026-11-30"] };
    expect(addOpenDays("2026-11-25", 1, vacation)).toBe("2026-12-01");
  });

  it("counts open days after booking, through the visit day", () => {
    expect(openDaysBetween("2026-10-26", "2026-11-12", dana)).toBe(10);
    expect(openDaysBetween("2026-11-25", "2026-12-14", dana)).toBe(9);
    expect(openDaysBetween("2026-11-24", "2026-12-01", dana)).toBe(3);
  });
});

describe("gfeDueDate, Dana's hours", () => {
  it("demo client: booked Mon Oct 26, visit Thu Nov 12 (10 open days) is due Thu Oct 29", () => {
    const due = gfeDueDate({ kind: "scheduled", scheduledOn: "2026-10-26", serviceOn: "2026-11-12" }, dana);
    expect(due.dueOn).toBe("2026-10-29");
    expect(due.rule).toMatch(/\(vi\)\(B\)$/);
  });

  it("Thanksgiving, 9 open days out: 1 open day, Mon Nov 30", () => {
    const due = gfeDueDate({ kind: "scheduled", scheduledOn: "2026-11-25", serviceOn: "2026-12-14" }, dana);
    expect(due.leadDays).toBe(9);
    expect(due.dueOn).toBe("2026-11-30");
  });

  it("Thanksgiving, 10 open days out: 3 open days, Wed Dec 2", () => {
    expect(gfeDueDate({ kind: "scheduled", scheduledOn: "2026-11-25", serviceOn: "2026-12-15" }, dana).dueOn).toBe("2026-12-02");
  });

  it("requested Tue Nov 10: skips Veterans Day, Friday and the weekend, Tue Nov 17", () => {
    expect(gfeDueDate({ kind: "requested", requestedOn: "2026-11-10" }, dana).dueOn).toBe("2026-11-17");
  });

  it("exactly 3 open days out: due the next open day, Wed Nov 25", () => {
    const due = gfeDueDate({ kind: "scheduled", scheduledOn: "2026-11-24", serviceOn: "2026-12-01" }, dana);
    expect(due.dueOn).toBe("2026-11-25");
    expect(due.rule).toMatch(/\(vi\)\(A\)$/);
  });

  it("fewer than 3 open days out: no deadline at booking", () => {
    const due = gfeDueDate({ kind: "scheduled", scheduledOn: "2026-11-25", serviceOn: "2026-11-30" }, dana);
    expect(due.leadDays).toBe(1);
    expect(due.dueOn).toBeNull();
  });

  it("refuses a visit before the booking", () => {
    expect(() => gfeDueDate({ kind: "scheduled", scheduledOn: "2026-11-25", serviceOn: "2026-11-20" }, dana)).toThrow();
  });
});

describe("gfeDueDate, default hours (Mon-Fri)", () => {
  it("requested Tue Nov 10 is due Mon Nov 16", () => {
    expect(gfeDueDate({ kind: "requested", requestedOn: "2026-11-10" }).dueOn).toBe("2026-11-16");
    expect(gfeDueDate({ kind: "requested", requestedOn: "2026-11-10" }, WEEKDAYS).dueOn).toBe("2026-11-16");
  });
});
