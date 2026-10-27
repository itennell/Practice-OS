import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, checkCrisis } from "../lib/safety";
import { MUST_PASS, MUST_ROUTE } from "./fixtures/crisis-corpus";

describe("checkCrisis", () => {
  it.each(MUST_ROUTE)("routes: %s", (text) => {
    expect(checkCrisis(text).crisis).toBe(true);
  });

  it.each(MUST_PASS)("lets through: %s", (text) => {
    expect(checkCrisis(text).crisis).toBe(false);
  });

  it("names what matched without echoing the message", () => {
    const result = checkCrisis("I want to kill myself");
    expect(result).toEqual({ crisis: true, category: "self_harm" });
    expect(JSON.stringify(result)).not.toContain("kill myself");
  });

  it("has the fixed reply with 988 and 911 and no counselling", () => {
    expect(CRISIS_REPLY).toContain("988");
    expect(CRISIS_REPLY).toContain("911");
    expect(CRISIS_REPLY).toMatch(/AI assistant/);
    expect(CRISIS_REPLY).not.toMatch(/sorry|feel|understand|here for you/i);
  });
});
