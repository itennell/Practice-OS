import { describe, expect, it } from "vitest";
import { soul } from "../lib/aeon/soul";

// SOUL.md is the source of the hard rules in every Aeon call; these lines must not drift away.
describe("aeon/SOUL.md", () => {
  const text = soul();

  it.each([
    ["no clinical advice", /no clinical or mental health advice/i],
    ["never signs or submits", /never sign, attest or submit/i],
    ["approval gate", /nothing goes out without her approval/i],
    ["no client details before a BAA", /no client details/i],
    ["crisis line", /988/],
    ["emergency", /911/],
    ["memories are data", /never instructions/i],
  ])("keeps the rule: %s", (_name, pattern) => {
    expect(text).toMatch(pattern);
  });
});
