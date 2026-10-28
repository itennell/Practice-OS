import { describe, expect, it } from "vitest";
import { firstFor, HELPERS, QUESTIONS } from "@/lib/onboarding/chapters";

// Plain language for everyone from a brand-new clinician to a 95-year-old: the
// interview's words should read at about a 6th-grade level (Flesch-Kincaid grade).

function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}

function grade(text: string): number {
  const sentences = Math.max(1, text.match(/[.!?]+(\s|$)/g)?.length ?? 0);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

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
