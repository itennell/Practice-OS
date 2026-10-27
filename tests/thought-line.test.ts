import { describe, expect, it } from "vitest";
import { formatTenths, spokenTenths } from "../components/shared/thought-line-time";

describe("Thought Line timer", () => {
  it("shows seconds with one decimal, then minutes", () => {
    expect(formatTenths(42)).toBe("4.2s");
    expect(formatTenths(599)).toBe("59.9s");
    expect(formatTenths(630)).toBe("1m 3.0s");
  });

  it("says it in words for screen readers", () => {
    expect(spokenTenths(42)).toBe("4.2 seconds");
    expect(spokenTenths(630)).toBe("1 minute 3.0 seconds");
    expect(spokenTenths(1260)).toBe("2 minutes 6.0 seconds");
  });
});
