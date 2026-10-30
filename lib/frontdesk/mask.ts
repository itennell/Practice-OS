import { normalizeForCheck } from "../aeon/guard";
import { findNames } from "../aeon/phi-classifier";
import { toE164 } from "./phone/numbers";

// What Muse may read of a caller's voicemail or text. Callers aren't her
// clients yet, but what they say is still private, so their details stay on
// this computer: plain code pulls the callback number and a first name out
// first, then numbers, emails, dates and every name the local name-finder sees
// are blanked before the words reach Muse. Muse only says what the caller
// wants (book, reschedule, cancel, question) and a logistics-only summary.
// If the name-finder can't load, nothing goes to Muse (fails closed).

const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;
const DATE = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g;
const DIGITS = /\b\d{5,}\b/g;
// "this is Sam", "my name is Sam", "it's Sam": a capitalised word right after.
const SELF_NAME = /\b(?:this is|my name is|name's|it's|it is|i am|i'm)\s+([A-Z][a-z]{1,20})\b/;
const NOT_NAMES = new Set(["Calling", "Just", "Looking", "Interested", "Wondering", "Hoping", "Trying", "Not", "Sorry", "Hi", "Hello", "The", "About"]);

export type Masked = { text: string; name: string | null; callbackNumber: string | null };

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

export async function maskForModel(text: string, names: (t: string) => Promise<string[]> = findNames): Promise<Masked> {
  const name = selfName(text);
  const callbackNumber = spokenNumber(text);
  let out = text.replace(EMAIL, "[email]").replace(PHONE, "[number]").replace(DATE, "[date]").replace(DIGITS, "[number]");
  const found = await names(normalizeForCheck(out)); // throws if the model can't load: the caller falls back to keywords
  for (const n of new Set([...found, ...(name ? [name] : [])])) {
    out = out.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "[name]");
  }
  return { text: out, name, callbackNumber };
}
