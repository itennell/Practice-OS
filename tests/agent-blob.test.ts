import { describe as group, expect, it } from "vitest";
import {
  AGENT_STOPS,
  BLINK_S,
  EYE_INK,
  READ_LINE_S,
  blinkOpenness,
  breathe,
  describe,
  initialMachine,
  nextBlinkIn,
  popOpenness,
  readingGaze,
  reduce,
  shown,
} from "../components/agent-blob/motion";
import { parseColor, ratio } from "../lib/ui/contrast";

group("agent blob state machine", () => {
  it("splashes on appear, then lands in its steady state", () => {
    let m = initialMachine("rest");
    expect(shown(m)).toBe("pop");
    m = reduce(m, { type: "settled", popId: m.popId });
    expect(shown(m)).toBe("rest");
  });

  it("can start without a splash", () => {
    expect(shown(initialMachine("work", false))).toBe("work");
  });

  it("lands in work when work starts mid-splash", () => {
    let m = initialMachine("rest");
    m = reduce(m, { type: "set", steady: "work" });
    expect(shown(m)).toBe("pop");
    m = reduce(m, { type: "settled", popId: m.popId });
    expect(shown(m)).toBe("work");
  });

  it("ignores a stale settled from an earlier splash", () => {
    let m = initialMachine("rest");
    const first = m.popId;
    m = reduce(m, { type: "appear" });
    m = reduce(m, { type: "settled", popId: first });
    expect(shown(m)).toBe("pop");
  });

  it("returns the same object when nothing changes", () => {
    const m = initialMachine("rest", false);
    expect(reduce(m, { type: "set", steady: "rest" })).toBe(m);
  });
});

group("breathing", () => {
  it("scales 1 to 1.06 over 4 seconds", () => {
    expect(breathe(0)).toBeCloseTo(1, 6);
    expect(breathe(2)).toBeCloseTo(1.06, 6);
    expect(breathe(4)).toBeCloseTo(1, 6);
  });
});

group("accessible name", () => {
  it("says what the agent is doing in plain words", () => {
    expect(describe("aeon", "work")).toBe("Aeon is working");
    expect(describe("front-desk", "rest")).toBe("Front Desk is resting");
  });
});

group("eyes", () => {
  it("blinks every 3-6 seconds resting and 5-9 working", () => {
    expect(nextBlinkIn("rest", () => 0)).toBe(3);
    expect(nextBlinkIn("rest", () => 1)).toBe(6);
    expect(nextBlinkIn("work", () => 0)).toBe(5);
    expect(nextBlinkIn("work", () => 1)).toBe(9);
  });

  it("shuts halfway through a 130ms blink and is open either side", () => {
    expect(blinkOpenness(0)).toBe(1);
    expect(blinkOpenness(BLINK_S / 2)).toBeCloseTo(0, 6);
    expect(blinkOpenness(BLINK_S)).toBe(1);
  });

  it("squints through a splash, opens wide, then settles", () => {
    expect(popOpenness(0.1)).toBeCloseTo(0.3);
    expect(popOpenness(0.7)).toBeCloseTo(1.15);
    expect(popOpenness(1)).toBeCloseTo(1);
  });

  it("reads left to right, then jumps back quickly", () => {
    expect(readingGaze(0)).toBeCloseTo(-1);
    expect(readingGaze(READ_LINE_S * 0.88)).toBeCloseTo(1);
    expect(readingGaze(READ_LINE_S)).toBeCloseTo(-1);
    // the sweep takes most of the line, the return is fast
    expect(readingGaze(READ_LINE_S * 0.44)).toBeCloseTo(0);
  });

  it("dark eyes stand out from every agent's blob (3:1 for graphics)", () => {
    for (const stops of Object.values(AGENT_STOPS)) {
      for (const [colour] of stops.slice(1, 3)) {
        expect(ratio(parseColor(EYE_INK)!, parseColor(colour)!)).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
