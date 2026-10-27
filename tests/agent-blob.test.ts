import { describe as group, expect, it } from "vitest";
import { breathe, describe, initialMachine, reduce, shown } from "../components/agent-blob/motion";

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
