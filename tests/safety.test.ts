import { describe, expect, it } from "vitest";
import { CRISIS_REPLY, checkCrisis } from "../lib/safety";
import { MUST_PASS, MUST_PASS_REVIEW, MUST_ROUTE, MUST_ROUTE_AS } from "./fixtures/crisis-corpus";

describe("checkCrisis", () => {
  it.each(MUST_ROUTE)("routes: %s", (text) => {
    expect(checkCrisis(text).crisis).toBe(true);
  });

  it.each(MUST_ROUTE_AS)("routes as the right category: %s", (text, category) => {
    expect(checkCrisis(text)).toEqual({ crisis: true, category });
  });

  it.each(MUST_PASS_REVIEW)("lets a practice task through: %s", (text) => {
    expect(checkCrisis(text).crisis).toBe(false);
  });

  it("stays fast on long hostile input", () => {
    const start = Date.now();
    checkCrisis("a ".repeat(50000) + "can't ".repeat(5000) + "hopeless ".repeat(2000));
    checkCrisis("took " + "a ".repeat(20000) + "pills");
    expect(Date.now() - start).toBeLessThan(500);
  });

  it.each(["I wish I was dead", "I don't want to be alive", "I want to disappear"])("routes indirect wording: %s", (text) => {
    expect(checkCrisis(text)).toEqual({ crisis: true, category: "self_harm" });
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
