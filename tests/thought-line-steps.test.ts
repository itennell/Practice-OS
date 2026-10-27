import { describe, expect, it } from "vitest";
import { normalizeSteps } from "../components/shared/thought-line-steps";

describe("Thought Line steps", () => {
  it("plain strings: past work is done, the last one runs while working", () => {
    expect(normalizeSteps(["a", "b"], true).map((s) => s.status)).toEqual(["done", "running"]);
    expect(normalizeSteps(["a", "b"], false).map((s) => s.status)).toEqual(["done", "done"]);
  });

  it("planned tasks keep their own status while working", () => {
    const steps = normalizeSteps(
      [
        { label: "a", status: "done" },
        { label: "b", status: "running" },
        { label: "c", status: "pending" },
      ],
      true,
    );
    expect(steps.map((s) => s.status)).toEqual(["done", "running", "pending"]);
  });

  it("when work ends nothing is left running or waiting, but failures stay failed", () => {
    const steps = normalizeSteps(
      [
        { label: "a", status: "running" },
        { label: "b", status: "failed" },
        { label: "c", status: "pending" },
      ],
      false,
    );
    expect(steps.map((s) => s.status)).toEqual(["done", "failed", "done"]);
  });
});
