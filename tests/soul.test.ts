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
    // Nov 2 re-test: billing for 90839 and a website crisis policy were declined as clinical.
    ["crisis billing is practice business", /CPT 90839/],
    ["a crisis policy page is logistics, with 988 and 911", /crisis or emergency policy page[^\n]*988[^\n]*911/i],
    ["the policy page gives no clinical advice", /policy page[^\n]*no coping tips/i],
  ])("keeps the rule: %s", (_name, pattern) => {
    expect(text).toMatch(pattern);
  });
});
