// Layer 1 of the sensitive-info guard: plain-code rules, no model, no network.
// Built from the HIPAA Safe Harbor identifiers (45 CFR 164.514(b)(2)) that can
// show up in a chat, plus diagnoses tied to a person. Until there is a BAA,
// Aeon keeps practice-business facts only (AGENTS.md > Aeon's memory).
// Layer 2 (phi-classifier.ts) catches bare names these rules can't.

export type PhiKind = "birth_date" | "client_name" | "diagnosis" | "identifier" | "contact" | "address";
export type PhiCheck = { ok: true } | { ok: false; kind: PhiKind };
export const ALL_KINDS: readonly PhiKind[] = ["birth_date", "client_name", "diagnosis", "identifier", "contact", "address"];

/** Names and contact details that belong to the practice: her profile and her Referrals list. */
export type Allowlist = { names: string[]; contacts: string[] };

// ---- dates -------------------------------------------------------------------

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE_PATTERNS = [
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/gi, // 3/14/1988, 07/02/90
  /\b(\d{4})-(\d{2})-(\d{2})\b/g, // 1990-07-02
  new RegExp(`\\b${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), // March 14, 1988
];
const BIRTH_WORDS = /\b(born|dob|d\.\s?o\.\s?b\.?|birthday|birth\s?date|date of birth)\b|(?:^|\s)b\.\s/i;

function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? (n > 30 ? 1900 + n : 2000 + n) : n;
}

function yearsOfDates(text: string): number[] {
  const years: number[] = [];
  for (const pattern of DATE_PATTERNS) {
    for (const m of text.matchAll(pattern)) {
      const raw = pattern === DATE_PATTERNS[1] ? m[1] : m[m.length - 1];
      years.push(fullYear(raw));
    }
  }
  return years;
}

function hasBirthDate(text: string): boolean {
  const years = yearsOfDates(text);
  if (years.length === 0) return false;
  // A date next to a birth word, or any full date before 2010: business dates
  // (renewals, attestations, first visits) are recent or in the future.
  return BIRTH_WORDS.test(text) || years.some((y) => y >= 1900 && y < 2010);
}

// ---- people ------------------------------------------------------------------

// Capitalized words that follow "client" or a title without being a name.
const NOT_NAMES = new Set(
  (
    "Intake Portal Form Forms Services Service Agreement Consent Packet Rights Handbook Fees Fee Policy Policies " +
    "Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August " +
    "September October November December I The A An And Or But If So My Our Your Their Is Was Has Needs Wants Asked"
  ).split(" "),
);

const NAME = "([A-Z][a-z'’-]+(?:\\s+[A-Z][a-z'’-]+)?)";
const NAME_AFTER = [
  new RegExp(`\\b(?:[Cc]lient|[Pp]atient|[Cc]aller)s?\\b(?:\\s+(?:named|called|is))?[\\s,:]+${NAME}`, "g"),
  new RegExp(`\\b[Mm]y\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|o'?clock|o’clock)\\b[\\s,:]+${NAME}`, "g"),
  new RegExp(`\\b(?:Mr|Ms|Mrs|Miss|Mx)\\.?\\s+${NAME}`, "g"),
];
const NAME_BEFORE = new RegExp(`${NAME}(?:\\s+is|,)\\s+(?:my|a|our)\\s+(?:client|patient)\\b`, "g");

function isAllowedName(name: string, allow: Allowlist): boolean {
  const first = name.split(/\s+/)[0];
  if (NOT_NAMES.has(first)) return true;
  const lower = name.toLowerCase();
  return allow.names.some((n) => n.toLowerCase().includes(lower));
}

function hasClientName(text: string, allow: Allowlist): boolean {
  for (const pattern of [...NAME_AFTER, NAME_BEFORE]) {
    for (const m of text.matchAll(pattern)) {
      if (!isAllowedName(m[1], allow)) return true;
    }
  }
  return false;
}

// ---- diagnoses ---------------------------------------------------------------

// ICD-10-CM with the decimal point (F41.1), the form clinicians write; same
// letter rules as lib/gfe/identity.ts. Bare "F41" is too close to everyday codes.
const ICD10 = /\b[A-TV-Z][0-9][0-9A-Z]\.[0-9A-Z]{1,4}\b/;
const DIAGNOSIS =
  /\b(depression|depressive|anxiety|gad|ptsd|c-?ptsd|bipolar|schizo\w*|adhd|ocd|bpd|borderline|autism|autistic|anorexia|bulimia|binge eating|eating disorder|psychosis|psychotic|dementia|panic disorder|disorder|substance use|alcohol use|opioid use|self[- ]?harm)\b/i;
const DIAGNOSED = /\b(diagnos\w*|dx)\b/i;
const PERSON_REF =
  /\b(clients?|patients?|caller'?s?|he|she|they|him|her|his|their|them|son|daughter|kid|child|husband|wife|partner|mom|dad|mother|father|someone|somebody)\b/i;

function hasDiagnosis(text: string): boolean {
  if (ICD10.test(text)) return true;
  return text
    .split(/[.!?;\n]+/)
    .some((sentence) => DIAGNOSIS.test(sentence) && (PERSON_REF.test(sentence) || DIAGNOSED.test(sentence)));
}

// ---- identifiers, contacts, addresses ----------------------------------------

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const SSN_WORDS = /\b(ssn|social security)\b[^0-9]{0,20}\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/i;
const RECORD_ID =
  /\b(member|policy|subscriber|mrn|medical record|chart|patient|client)\s*(?:id|number|no\.?|#)?\s*[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,}\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Needs separators, so a 10-digit NPI isn't read as a phone number.
const PHONE = /(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\b\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g;
const STREET =
  /\b\d{1,5}\s+(?:[NSEW]\.?\s+)?[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace)\b\.?/g;

const digits = (s: string) => s.replace(/\D/g, "");

function hasForeignContact(text: string, allow: Allowlist): boolean {
  const ownEmails = allow.contacts.map((c) => c.toLowerCase());
  const ownPhones = allow.contacts.map(digits).filter((d) => d.length >= 10).map((d) => d.slice(-10));
  for (const m of text.matchAll(EMAIL)) if (!ownEmails.includes(m[0].toLowerCase())) return true;
  for (const m of text.matchAll(PHONE)) if (!ownPhones.includes(digits(m[0]).slice(-10))) return true;
  return false;
}

function hasClientAddress(text: string, allow: Allowlist): boolean {
  const own = allow.contacts.map((c) => c.toLowerCase());
  for (const m of text.matchAll(STREET)) {
    const found = m[0].toLowerCase().replace(/\.$/, "");
    if (!own.some((c) => c.includes(found) || found.includes(c)) && PERSON_REF.test(text)) return true;
  }
  return false;
}

// ---- the check ---------------------------------------------------------------

export function checkIdentity(
  text: string,
  allow: Allowlist = { names: [], contacts: [] },
  only: readonly PhiKind[] = ALL_KINDS,
): PhiCheck {
  const checks: [PhiKind, () => boolean][] = [
    ["birth_date", () => hasBirthDate(text)],
    ["identifier", () => SSN.test(text) || SSN_WORDS.test(text) || RECORD_ID.test(text)],
    ["diagnosis", () => hasDiagnosis(text)],
    ["contact", () => hasForeignContact(text, allow)],
    ["address", () => hasClientAddress(text, allow)],
    ["client_name", () => hasClientName(text, allow)],
  ];
  for (const [kind, found] of checks) if (only.includes(kind) && found()) return { ok: false, kind };
  return { ok: true };
}
