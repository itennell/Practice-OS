import { ATTORNEY_PATTERN, type FormDef } from "./types";

// The plain-code accuracy check: every required element of a form type (from the
// research matrix) must be said on the page, plus the attorney-review line. It
// reads text, so tests run it on the PDF's own extracted text and the library
// runs it on the template before it saves her edits. Also a reading-level score:
// clients sign these, so they should read at about an 8th-grade level.

export type CheckResult = {
  ok: boolean;
  missing: { id: string; label: string; citation: string }[];
  disclaimer: boolean;
  grade: number;
};

const squash = (s: string) => s.replace(/\s+/g, " ");

export function checkText(def: FormDef, text: string): CheckResult {
  const t = squash(text);
  const missing = def.elements.filter((e) => !e.mustSay.every((re) => re.test(t))).map(({ id, label, citation }) => ({ id, label, citation }));
  const disclaimer = ATTORNEY_PATTERN.test(t);
  return { ok: missing.length === 0 && disclaimer, missing, disclaimer, grade: readingGrade(text) };
}

/** Flesch-Kincaid grade level: 0.39 (words/sentences) + 11.8 (syllables/words) - 15.59. */
export function readingGrade(text: string): number {
  const prose = text
    .split("\n")
    .filter((l) => /[.!?]["')]?\s*$/.test(l.trim()) && l.split(/\s+/).length >= 4) // labels, headings and captions aren't sentences
    .join(" ");
  const words = prose.match(/[A-Za-z][A-Za-z']*/g) ?? [];
  if (words.length === 0) return 0;
  const sentences = Math.max(1, (prose.match(/[.!?](\s|$)/g) ?? []).length);
  const syllables = words.reduce((n, w) => n + syllableCount(w), 0);
  return Math.round((0.39 * (words.length / sentences) + 11.8 * (syllables / words.length) - 15.59) * 10) / 10;
}

export function syllableCount(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (trimmed.match(/[aeiouy]{1,2}/g) ?? []).length);
}
