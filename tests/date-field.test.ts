import { describe, expect, it } from "vitest";
import { dateFieldError, formatTyped, fromIso, parseTyped, toIso } from "../components/shared/date-field-parse";

describe("date field text", () => {
  it("reads US typing and ISO days", () => {
    expect(parseTyped("11/25/2026")).toBe("2026-11-25");
    expect(parseTyped("1/5/2027")).toBe("2027-01-05");
    expect(parseTyped("2026-11-25")).toBe("2026-11-25");
  });

  it("refuses dates that don't exist or aren't finished", () => {
    expect(parseTyped("02/30/2026")).toBeNull();
    expect(parseTyped("13/01/2026")).toBeNull();
    expect(parseTyped("11/25")).toBeNull();
    expect(parseTyped("")).toBeNull();
  });

  it("round-trips through the calendar without slipping a day", () => {
    expect(toIso(fromIso("2026-03-08"))).toBe("2026-03-08");
    expect(formatTyped("2026-11-25")).toBe("11/25/2026");
    expect(formatTyped("")).toBe("");
  });

  it("names what is wrong with a typed date, so a form can block its submit (a past date never books)", () => {
    const opts = { min: "2026-11-03", required: true };
    expect(dateFieldError("11/01/2026", opts)).toBe("Pick 11/03/2026 or later.");
    expect(dateFieldError("11/03/2026", opts)).toBe("");
    expect(dateFieldError("11/0", opts)).toBe("Type a date like 11/25/2026, or pick one.");
    expect(dateFieldError("", opts)).toBe("Pick a date.");
    expect(dateFieldError("", {})).toBe("");
    expect(dateFieldError("12/31/2027", { max: "2027-01-01" })).toBe("Pick 01/01/2027 or earlier.");
  });
});
