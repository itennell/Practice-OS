import { describe, expect, it } from "vitest";
import { firstFor, HELPERS, QUESTIONS } from "@/lib/onboarding/chapters";
import { grade } from "./helpers/readability";

// Plain language for everyone from a brand-new clinician to a 95-year-old: the
// interview's words should read at about a 6th-grade level (Flesch-Kincaid grade).

const sentences = [
  ...QUESTIONS.flatMap((q) => [q.ask, q.help ?? "", q.aeonSays]),
  ...HELPERS.map((h) => h.does),
  ...(["beginning", "middle", "late"] as const).map((s) => firstFor(s).focus),
].filter(Boolean);

describe("onboarding reading level", () => {
  it("reads at a 6th-grade level or easier overall", () => {
    expect(grade(sentences.join(" "))).toBeLessThanOrEqual(6);
  });

  it("keeps every full sentence short and plain (legal names like PSYPACT aside)", () => {
    const hard = sentences.filter((t) => t.split(/\s+/).length >= 6 && !/PSYPACT|IMPACT|CAQH|Medicare|Medicaid|EIN|NPI|PLLC|LCPC|qualified examiner/.test(t) && grade(t) > 10);
    expect(hard).toEqual([]);
  });
});
