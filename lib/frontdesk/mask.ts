import { normalizeForCheck } from "../aeon/guard";
import { findNames } from "../aeon/phi-classifier";
import { toE164 } from "./phone/numbers";
import { EMAIL, PHONE, SPOKEN_DIGITS, SPOKEN_EMAIL } from "./redact";

// What Muse may read of a caller's voicemail or text. Callers aren't her
// clients yet, but what they say is still private, so their details stay on
// this computer: plain code pulls the callback number and a first name out
// first, then numbers, emails, dates and every name the local name-finder sees
// are blanked before the words reach Muse. Muse only says what the caller
// wants (book, reschedule, cancel, question) and a logistics-only summary.
// Spoken details count too: digits read out one by one, dates said in words
// ("March third, nineteen ninety") and emails read aloud ("sam at gmail dot com").
// What plain code can't blank for sure (an email read aloud, or digit or date
// words left over after masking) means nothing goes to Muse: the caller falls
// back to the keyword reading. If the name-finder can't load, the same (fails closed).

const DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const DIGITS = /\b\d{5,}\b/g;

const MONTH = String.raw`(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept?|oct|nov|dec)\.?`;
const UNIT = String.raw`(?:one|two|three|four|five|six|seven|eight|nine)`;
const ORDINAL_UNIT = String.raw`(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)`;
const DAY = String.raw`(?:\d{1,2}(?:st|nd|rd|th)?|(?:twenty|thirty)[\s-]?(?:${ORDINAL_UNIT}|${UNIT})|${ORDINAL_UNIT}|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|${UNIT})`;
const TENS = String.raw`(?:ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-]${UNIT})?)`;
const YEAR = String.raw`(?:(?:19|20)\d{2}|(?:nineteen|twenty)[\s-](?:oh[\s-]${UNIT}|hundred|${TENS})|two\sthousand(?:\sand)?(?:[\s-](?:${TENS}|${UNIT}))?)`;
// "March third, nineteen ninety", "the 4th of July 1990", "nineteen eighty-two".
const SPOKEN_DATE = new RegExp(
  String.raw`\b(?:${MONTH}\s+(?:the\s+)?${DAY}(?:,?\s+${YEAR})?|(?:the\s+)?${DAY}\s+of\s+${MONTH}(?:,?\s+${YEAR})?|${YEAR})\b`,
  "gi",
);

// After masking: still three number words close together, or a month next to
// one. Something was said that plain code didn't blank for sure.
const NUMBER_WORD = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|double|triple)`;
const LEFTOVER_DIGITS = new RegExp(String.raw`\b${NUMBER_WORD}\b(?:\W+\w+){0,2}?\W+${NUMBER_WORD}\b(?:\W+\w+){0,2}?\W+${NUMBER_WORD}\b`, "i");
// ("May" left out here: "May I book one" is a question, not a date.)
const MONTH_NOT_MAY = MONTH.replace("may|", "");
const LEFTOVER_DATE = new RegExp(String.raw`\b${MONTH_NOT_MAY}\W+(?:\w+\W+){0,3}?(?:${DAY}|${NUMBER_WORD})\b|\b(?:${DAY}|${NUMBER_WORD})\W+(?:\w+\W+){0,3}?${MONTH_NOT_MAY}\b`, "i");

// "this is Sam", "my name is Sam", "it's Sam": a capitalised word right after.
const SELF_NAME = /\b(?:this is|my name is|name's|it's|it is|i am|i'm)\s+([A-Z][a-z]{1,20})\b/;
const NOT_NAMES = new Set(["Calling", "Just", "Looking", "Interested", "Wondering", "Hoping", "Trying", "Not", "Sorry", "Hi", "Hello", "The", "About"]);

export type Masked = { text: string; name: string | null; callbackNumber: string | null };

/** Thrown when the words hold a spoken detail plain code can't blank for sure. */
export class UnmaskableError extends Error {
  constructor(what: string) {
    super(`The message has ${what} that can't be blanked for sure; using keywords instead of Muse.`);
  }
}

/** The first spoken phone number, as plain code reads it. */
export function spokenNumber(text: string): string | null {
  for (const m of text.matchAll(PHONE)) {
    const n = toE164(m[0]);
    if (n) return n;
  }
  return null;
}

/** A first name the caller gave for themselves, by plain code. */
export function selfName(text: string): string | null {
  const m = SELF_NAME.exec(text);
  return m && !NOT_NAMES.has(m[1]) ? m[1] : null;
}

/** Blanks numbers, emails and dates, written or spoken. Throws UnmaskableError if any is left. */
export function blankDetails(text: string): string {
  if (new RegExp(SPOKEN_EMAIL.source, "i").test(text)) throw new UnmaskableError("an email read aloud");
  const out = text
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[number]")
    .replace(DATE, "[date]")
    .replace(SPOKEN_DATE, "[date]")
    .replace(SPOKEN_DIGITS, "[number]")
    .replace(DIGITS, "[number]");
  if (LEFTOVER_DIGITS.test(out)) throw new UnmaskableError("digits said as words");
  if (LEFTOVER_DATE.test(out)) throw new UnmaskableError("a date said in words");
  return out;
}

export async function maskForModel(text: string, names: (t: string) => Promise<string[]> = findNames): Promise<Masked> {
  const name = selfName(text);
  const callbackNumber = spokenNumber(text);
  let out = blankDetails(text); // throws: the caller falls back to keywords
  const found = await names(normalizeForCheck(out)); // throws if the model can't load: the caller falls back to keywords
  for (const n of new Set([...found, ...(name ? [name] : [])])) {
    out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
  }
  return { text: out, name, callbackNumber };
}
