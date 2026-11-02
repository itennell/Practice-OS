// Plain-code patterns for a caller's contact details, shared by what Muse may
// read (mask.ts) and what the Front Desk page shows (inbox rows, alerts).
// No database and no model here, so any screen or helper can use it.

export const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
export const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

// Spoken digits: "three one two, five five five, oh one four four". Four or more
// digit words (or short digit groups) in a row, with commas, dashes or spaces between.
const DIGIT_TOKEN = String.raw`(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|double|triple|\d{1,4})`;
export const SPOKEN_DIGITS = new RegExp(String.raw`\b${DIGIT_TOKEN}(?:[\s,.-]+${DIGIT_TOKEN}){3,}\b`, "gi");

// An email read aloud: "sam at gmail dot com". Where the name part starts can't
// be told reliably, so mask.ts never sends one to Muse.
export const SPOKEN_EMAIL = /\b(?:at\s+[a-z0-9-]+\s+)?dot\s+(?:com|net|org|edu|gov|io|us|co|me|info|biz)\b|\bat\s+(?:gmail|yahoo|hotmail|outlook|icloud|aol|comcast|protonmail|proton)\b|\b[a-z0-9._-]+\s+at\s+[a-z0-9-]+(?:\s+dot\s+[a-z]{2,})+\b/gi;

/** "(•••) •••-0144": enough to tell callers apart, not enough to call them. */
export function maskPhone(e164: string | null): string {
  if (!e164) return "Hidden number";
  const digits = e164.replace(/\D/g, "");
  return digits.length >= 4 ? `(•••) •••-${digits.slice(-4)}` : "Hidden number";
}

/** Who an approval title or preview names: her saved name, else the masked number. Never the full number. */
export function approvalWho(name: string | null, phone: string | null): string {
  return name ?? maskPhone(phone);
}

/**
 * A caller's words as the page shows them before she taps Show: phone numbers
 * down to the last four digits, emails and spoken digit runs blanked.
 */
export function blankContacts(text: string): { text: string; hidden: boolean } {
  const out = text
    .replace(EMAIL, "[email]")
    .replace(SPOKEN_EMAIL, "[email]")
    .replace(PHONE, (m) => maskPhone(m))
    .replace(SPOKEN_DIGITS, (m) => (/[a-z]/i.test(m) || m.replace(/\D/g, "").length >= 5 ? "[number]" : m));
  return { text: out, hidden: out !== text };
}
