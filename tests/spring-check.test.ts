import { describe, expect, it } from "vitest";
import { springReadings } from "../components/shared/spring-check-readings";

describe("Spring Check readings", () => {
  it("is empty when unchecked and full when checked", () => {
    expect(springReadings(0)).toEqual({ fill: 0, box: 1, tick: 1, rule: 0 });
    expect(springReadings(1)).toEqual({ fill: 1, box: 1, tick: 0, rule: 1 });
  });

  it("swells the box only on overshoot", () => {
    expect(springReadings(1.1).box).toBeCloseTo(1.035);
    expect(springReadings(0.9).box).toBe(1);
  });

  it("starts the cross-out a beat after the check and finishes before it settles", () => {
    expect(springReadings(0.1).rule).toBe(0);
    expect(springReadings(0.84).rule).toBe(1);
    expect(springReadings(0.5).rule).toBeGreaterThan(0);
  });
});
