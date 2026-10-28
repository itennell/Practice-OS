// Plain-code screens that run on every memory before it is saved, on top of the
// client-detail guard (guard.ts). Memory goes into every future model call, so
// it is held to a stricter bar than chat (Hermes Agent scans memory the same
// way: tools/threat_patterns.py, strict tier).
//   1. injection: text that tries to steer the model, or hides characters.
//   2. critical numbers: account, card, tax, DEA, license and NPI numbers,
//      passwords, keys and tokens. Fees ($185), CPT codes (90837) and dates pass.

export type ScanKind = "injection" | "critical_number" | "client_initials";
export type ScanResult = { ok: true } | { ok: false; kind: ScanKind };

// ---- injection ---------------------------------------------------------------

// Zero-width and direction-override characters (Hermes blocks the same set).
const HIDDEN = /[\u200B-\u200D\u2060\u2062-\u2064\uFEFF\u202A-\u202E\u2066-\u2069]/;

const INJECTION = [
  /\b(ignore|disregard|forget|override|bypass)\b[^.]{0,40}\b(instructions?|rules?|prompt|guidelines|soul)\b/i,
  /\byou are now\b/i,
  /\b(new|updated|real) (instructions?|rules)\b/i,
  /\bsystem (prompt|message)\b/i,
  /\bdeveloper (mode|message)\b/i,
  /<\/?(system|assistant|user|tool)>/i,
  /\[\/?(INST|SYS)\]/,
  /^\s*(system|assistant|developer)\s*:/im,
  /\b(always|never) (call|use|run) the\b/i,
  /\b(send|post|upload|forward)\b[^.]{0,40}\bhttps?:\/\//i,
  /\b(curl|wget)\s/i,
];

function hasInjection(text: string): boolean {
  return HIDDEN.test(text) || INJECTION.some((p) => p.test(text));
}

// ---- critical numbers --------------------------------------------------------

const digitsOf = (s: string) => s.replace(/\D/g, "");

function luhn(num: string): boolean {
  let sum = 0;
  for (let i = 0; i < num.length; i++) {
    let d = Number(num[num.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
const LABELLED = [
  // Bank: "routing 071000013", "acct # 12345678"
  /\b(routing|aba|account|acct|iban|swift)\b[^0-9\n]{0,15}\d[\d -]{3,}/i,
  // Tax: "EIN 12-3456789", "TIN", "tax id"
  /\b(ein|tin|itin|tax\s*id|federal\s*id)\b[^0-9\n]{0,12}\d{2}-?\d{7}\b/i,
  // NPI: "NPI 1234567893"
  /\bnpi\b[^0-9\n]{0,12}\d{10}\b/i,
  // License and DEA numbers, with letters or digits
  /\b(licen[cs]e|lic\.?|dea|caqh)\s*(?:#|no\.?|number|id)?\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,}\b/i,
  // Passwords, PINs, keys and tokens with a value after them
  /\b(password|passcode|passwd|pin|api[\s_-]?key|secret|token)\b\s*(?:is|=|:)\s*\S{4,}/i,
  /\b(password|passcode|passwd|pin)\s+(?=\S*\d)\S{4,}/i,
  // SSN-shaped numbers, with or without a label (an ITIN or SSN used as a tax ID)
  /\b\d{3}-\d{2}-\d{4}\b/,
];
const EIN = /\b\d{2}-\d{7}\b/;
const DEA = /\b[A-Z]{2}\d{7}\b/;
const KEY_SHAPES = /\b(sk|pk|rk)[-_][A-Za-z0-9_-]{12,}|\bgh[pousr]_[A-Za-z0-9]{20,}|\bAKIA[0-9A-Z]{16}\b|\bxox[abpr]-[A-Za-z0-9-]{10,}/;
const LONG_TOKEN = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{28,}\b/;
// Seven or more digits in a row. Money uses commas ($1,250,000) and dates use
// separators, so neither trips this.
const LONG_DIGITS = /(?<![\d,.$])\d{7,}(?!\d)/;

function hasCriticalNumber(text: string): boolean {
  for (const m of text.matchAll(CARD)) {
    const d = digitsOf(m[0]);
    if (d.length >= 13 && luhn(d)) return true;
  }
  return (
    LABELLED.some((p) => p.test(text)) ||
    EIN.test(text) ||
    DEA.test(text) ||
    KEY_SHAPES.test(text) ||
    LONG_TOKEN.test(text) ||
    LONG_DIGITS.test(text)
  );
}

// ---- initials ----------------------------------------------------------------

// Initials stand in for a name ("client R.K."). The client-detail guard looks
// for names, so memory adds this rule: initials in a sentence about a client.
const INITIALS = /\b(?!(?:U\.\s?S|P\.\s?O|A\.\s?M|P\.\s?M|D\.\s?C|N\.\s?A)\b)[A-Z]\.\s?[A-Z]\.?(?=['’]s\b|[\s,;:)]|$)|\binitials\b/;
const ABOUT_CLIENT = /\b(clients?|patients?|callers?|intakes?|sessions?|appts?|appointments?|cancell?ed|no[- ]shows?|\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i;

function hasClientInitials(text: string): boolean {
  return text.split(/(?<=[.!?])\s+(?=[A-Z][a-z])|\n/).some((s) => ABOUT_CLIENT.test(s) && INITIALS.test(s));
}

// ---- the scan ----------------------------------------------------------------

export function scanMemory(text: string): ScanResult {
  if (hasInjection(text)) return { ok: false, kind: "injection" };
  if (hasCriticalNumber(text)) return { ok: false, kind: "critical_number" };
  if (hasClientInitials(text)) return { ok: false, kind: "client_initials" };
  return { ok: true };
}
