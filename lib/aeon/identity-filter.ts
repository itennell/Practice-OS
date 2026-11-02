// Layer 1 of the sensitive-info guard: plain-code rules, no model, no network.
// Built from the HIPAA Safe Harbor identifiers (45 CFR 164.514(b)(2)) that can
// show up in a chat, plus diagnoses tied to a person. Until there is a BAA,
// Aeon keeps practice-business facts only (AGENTS.md > Aeon's memory).
// Layer 2 (phi-classifier.ts) catches bare names these rules can't.
//
// Default refuse: every exemption is narrow and positive (her own contacts, an
// official agency line, a sentence about her own services). A false block is
// acceptable; a leak isn't.

export type PhiKind = "birth_date" | "client_name" | "diagnosis" | "identifier" | "contact" | "address";
export type PhiCheck = { ok: true } | { ok: false; kind: PhiKind };
export const ALL_KINDS: readonly PhiKind[] = ["birth_date", "client_name", "diagnosis", "identifier", "contact", "address"];

/** Names and contact details that belong to the practice: her profile and her Referrals list. */
export type Allowlist = {
  names: string[];
  contacts: string[];
  /** The names in `names` that come from her Referrals board: public directory (NPPES) data, allowed only in a referral context. */
  directory?: string[];
};

// ---- sentences ---------------------------------------------------------------

// A dot ends a sentence unless it belongs to a title or an initial ("Dr.", "J.R.").
const NO_STOP_BEFORE = /(?:^|[^\p{L}])(?:\p{Lu}|Dr|Mr|Ms|Mrs|Mx|Prof|St|Ave|Av|Apt|vs|No)$/u;

/** [start, end) of each sentence: split at . ! ? ; line ends and between JSON fields. */
export function sentenceSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    let stop = c === "!" || c === "?" || c === ";" || c === "\n";
    if (c === "." && (i + 1 === text.length || /\s/.test(text[i + 1])) && !NO_STOP_BEFORE.test(text.slice(Math.max(0, i - 6), i))) stop = true;
    if (c === '"' && /^"\s*[,}\]]/.test(text.slice(i))) stop = true;
    if (stop) {
      spans.push([start, i + 1]);
      start = i + 1;
    }
  }
  if (start < text.length) spans.push([start, text.length]);
  return spans;
}

export function sentences(text: string): string[] {
  return sentenceSpans(text).map(([s, e]) => text.slice(s, e));
}

/** The sentence around position `at`. */
export function sentenceAt(text: string, at: number): string {
  const span = sentenceSpans(text).find(([s, e]) => at >= s && at < e);
  return span ? text.slice(span[0], span[1]) : text;
}

// ---- people words ------------------------------------------------------------

// One identifiable person (singular). Plurals ("clients", "adults") and a bare
// "child" in a legal answer are a population or a topic.
const ONE_PERSON_WORDS =
  "client|patient|caller'?s?|son|daughter|husband|wife|partner|mom|dad|mother|father|someone|somebody|" +
  "teen|teenager|guy|toddler|kid|boy|girl|baby|infant|nephew|niece|grandson|granddaughter|brother|sister|cousin|roommate|" +
  "\\d{1,2}[- ]year[- ]old|(?:my|the|our)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|o'?clock)|the\\s+one\\s+(?:on|who|from|with)|" +
  "(?:my|her|his|their|our|your)\\s+child";
const ONE_CLIENT = new RegExp(`\\b(?:${ONE_PERSON_WORDS})\\b`, "i");
// These can be her, a colleague or a client, so they count unless the sentence
// is about her own work ("She specializes in anxiety").
const PRONOUN = /\b(he|she|him|her|his)\b/i;
export const PRACTICE_TOPIC =
  /\b(speciali[sz]\w*|treat\w*|works?\s+with|working\s+with|help\w*|focus\w*\s+on|experience[ds]?\s+(?:in|with)|trained\s+in|training\s+in|serv(?:e|es|ed|ing)|support\w*|offer\w*|sees?|seeing|seen)\b/i;
// Anyone, for the date and address rules.
const PERSON_REF = new RegExp(`\\b(?:${ONE_PERSON_WORDS}|clients?|patients?|he|she|they|him|her|his|their|them|kids?|child)\\b`, "i");
const VISIT_WORDS = /\b(visits?|appointments?|appts?|cancel\w*|resched\w*|no[- ]?shows?|intake|came\s+in|turn(?:s|ed)\s+\d{1,3})\b/i;

// ---- dates -------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
type Ymd = { y: number; m: number; d: number };
const DATE_READERS: [RegExp, (m: RegExpMatchArray) => Ymd][] = [
  // 3/14/1988, 07.02.90, 3-14-15
  [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => ({ y: fullYear(m[3]), m: Number(m[1]), d: Number(m[2]) })],
  // 1990-07-02
  [/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g, (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) })],
  // March 14, 1988
  [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), (m) => ({ y: Number(m[3]), m: monthOf(m[1]), d: Number(m[2]) })],
  // 14 March 1988, the 14th of March, 1988
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})\\b`, "gi"), (m) => ({ y: Number(m[3]), m: monthOf(m[2]), d: Number(m[1]) })],
  // born in 1988
  [/\bborn\s+(?:in\s+)?(\d{4})\b/gi, (m) => ({ y: Number(m[1]), m: 1, d: 1 })],
];
const BIRTH_WORDS = /\b(born|dob|d\.\s?o\.\s?b\.?|birthday|birth\s?date|date of birth)\b|(?:^|\s)b\.\s/i;
const MONTH_WORD = new RegExp(`\\b${MONTH}\\b`, "i");

function monthOf(name: string): number {
  return MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;
}

function fullYear(raw: string): number {
  const n = Number(raw);
  return raw.length === 2 ? (n > 30 ? 1900 + n : 2000 + n) : n;
}

function datesIn(text: string): Ymd[] {
  return DATE_READERS.flatMap(([pattern, read]) => [...text.matchAll(pattern)].map(read));
}

function notFuture(d: Ymd, today: Date): boolean {
  const when = new Date(d.y, Math.max(0, d.m - 1), Math.max(1, d.d));
  return Number.isNaN(when.getTime()) || when.getTime() <= today.getTime();
}

function hasBirthDate(text: string, today = new Date()): boolean {
  return sentences(text).some((s) => {
    const dates = datesIn(s);
    // "born on the fourteenth of March": a birth word and a month, written out.
    if (dates.length === 0) return BIRTH_WORDS.test(s) && MONTH_WORD.test(s);
    if (BIRTH_WORDS.test(s)) return true;
    // Any full date before 2010: business dates (renewals, attestations) are recent or ahead.
    if (dates.some((d) => d.y >= 1900 && d.y < 2010)) return true;
    // A past date next to a person or a visit ("Her son (3-14-15)", "(3/14/2015) canceled her visit").
    return (PERSON_REF.test(s) || VISIT_WORDS.test(s)) && dates.some((d) => notFuture(d, today));
  });
}

// ---- client names ------------------------------------------------------------

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
  new RegExp(`\\b(?:[Mm]y|[Tt]he|[Oo]ur)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|o'?clock|o’clock)\\b[\\s,:]+${NAME}`, "g"),
  new RegExp(`\\b(?:Mr|Ms|Mrs|Miss|Mx)\\.?\\s+${NAME}`, "g"),
];
const NAME_BEFORE = new RegExp(`${NAME}(?:\\s+is|,)\\s+(?:my|a|our)\\s+(?:client|patient)\\b`, "g");

function isAllowedName(name: string, allow: Allowlist): boolean {
  const first = name.split(/\s+/)[0];
  if (NOT_NAMES.has(first)) return true;
  const lower = name.toLowerCase();
  return allow.names.some((n) => n.toLowerCase().includes(lower));
}

// "my client Gary Bucher": a name she calls a client is a client's, even when
// the same name is on her Referrals board (a provider is never "my client").
// Only a title ("Ms. Shah") falls back to the list, so a source can be named so.
const CLIENT_PATTERNS = new Set([NAME_AFTER[0], NAME_AFTER[1], NAME_BEFORE]);

function hasClientName(text: string, allow: Allowlist): boolean {
  for (const pattern of [...NAME_AFTER, NAME_BEFORE]) {
    for (const m of text.matchAll(pattern)) {
      const allowed = CLIENT_PATTERNS.has(pattern) ? NOT_NAMES.has(m[1].split(/\s+/)[0]) : isAllowedName(m[1], allow);
      if (!allowed) return true;
    }
  }
  return false;
}

/** "my client", "our patient": any name in such a sentence is a client's. */
export const MY_CLIENT = /\b(?:my|our)\s+(?:client|patient)s?\b/i;

// What a client's sentence looks like: a visit, a cancellation, a bill, a
// condition. Her own name is checked against OWN_SIGNAL (so "Book a first
// session with Dana" passes); everyone else against CLIENT_SIGNAL.
const OWN_SIGNAL =
  /\b(?:my|our|this|her|his|their)\s+(?:client|patient)\b|\b(?:came|come|comes|coming)\s+in\b|\bcancel(?:s|ed|led|ing)?\b|\bresched\w*|\bno[- ]?shows?\b|\bmissed\b|\binvoices?\b|\bowes?\b|\bbalance\b|\bstruggl\w*|\bdiagnos\w*|\bdob\b|\bborn\b|\b(?:her|his|their)\s+(?:\w+\s+){0,2}?(?:slot|appointment|appt|session|visit|consult|intake|therapy|therapist|treatment|meds|medication)s?\b/i;
const CLIENT_SIGNAL = new RegExp(`${OWN_SIGNAL.source}|\\b(?:visits?|appointments?|appts?|sessions?|consults?|intake|checked\\s+in|paid|late|copays?|superbills?|good faith estimates?|GFE)\\b`, "i");

/** A sentence that treats someone as a client. `own`: her own name, judged more loosely. */
export function clientLike(sentence: string, own = false): boolean {
  if ((own ? OWN_SIGNAL : CLIENT_SIGNAL).test(sentence)) return true;
  // A name with a past date beside it ("(3/14/2015) Jess wants Tuesdays") may be a birth date.
  if (!own && datesIn(sentence).some((d) => notFuture(d, new Date()))) return true;
  return DIAGNOSIS.test(sentence) && !(own && PRACTICE_TOPIC.test(sentence));
}

/**
 * The person-anchored rules, for tool results that keep the lighter check:
 * a birth word with a date, a phone or email next to a person or "cell", or a
 * condition someone has ("The teen has ADHD"). Rule text and practice records
 * (renewal dates, board phones, a law that names a disorder) pass.
 */
export function personalDetail(text: string, allow: Allowlist = { names: [], contacts: [] }): PhiKind | null {
  for (const s of sentences(text)) {
    if (BIRTH_WORDS.test(s) && (datesIn(s).length > 0 || MONTH_WORD.test(s))) return "birth_date";
    if (HAS_CONDITION.test(s) || OWNS_CONDITION.test(s) || initialsCondition(s) || (DIAGNOSED.test(s) && DIAGNOSIS.test(s))) return "diagnosis";
    if ((PERSON_REF.test(s) || /\b(cell|mobile)\b/i.test(s)) && hasForeignContact(s, allow)) return "contact";
  }
  return null;
}

// A sentence where a provider on her board belongs: their card, a letter,
// outreach, their office, specialty or NPI. Only here is a board name directory data.
const REFERRAL_CONTEXT =
  /\b(cards?|board|letters?|referr\w*|refers?|NPI|NPPES|outreach|practice|office|address|speciali[sz]\w*|specialt\w*|accepting|e-?mail|phone|fax|follow[- ]?ups?|call log|contact\w*|providers?|directory|status|colleagues?|network|introduc\w*|reach(?:ed)?\s+out|stage|column|pipeline|do not contact|LCSW|LICSW|LCPC|LPC|LMFT|MD|PhD|PsyD)\b/i;

export function referralContext(sentence: string): boolean {
  return REFERRAL_CONTEXT.test(sentence);
}

// ---- diagnoses ---------------------------------------------------------------

// ICD-10-CM with the decimal point (F41.1), the form clinicians write; same
// letter rules as lib/gfe/identity.ts. Bare "F41" is too close to everyday codes.
const ICD10 = /\b[A-TV-Z][0-9][0-9A-Z]\.[0-9A-Z]{1,4}\b/;
const DIAGNOSIS =
  /\b(depression|depressive|depressed|anxiety|anxious|gad|ptsd|c-?ptsd|bipolar|schizo\w*|adhd|ocd|bpd|borderline|autism|autistic|anorexia|anorexic|bulimia|bulimic|binge eating|eating disorder|psychosis|psychotic|dementia|panic disorder|disorder|substance use|alcohol use|opioid use|addiction|addicted|self[- ]?harm)\b/i;
// "was diagnosed", "dx", or a record label ("Diagnosis: ..."). The bare noun
// ("90839 needs a diagnosis") is billing talk, not about anyone.
const DIAGNOSED = /\b(diagnosed|dx)\b|\bdiagnos[ie]s\s*[:#]/i;
// A condition someone has: "has GAD", "they have OCD", "struggles with
// depression", "her schizophrenia". Her own work ("she has treated anxiety") isn't.
const SUBJECT = `(?:${ONE_PERSON_WORDS}|he|she|they)`;
const HAS =
  "(?:has|have|had|having|struggl\\w*|suffer\\w*|liv(?:es|ing)\\s+with|battl\\w*)(?!\\s+(?:been\\s+)?(?:work|help|treat|speciali[sz]|serv|seen|support|focus|train|offer)\\w*)";
const HAS_CONDITION = new RegExp(`\\b${SUBJECT}\\b(?:\\W+\\w+){0,2}?\\W+${HAS}\\b(?:\\W+\\w+){0,3}?\\W+${DIAGNOSIS.source}`, "i");
const OWNS_CONDITION = new RegExp(`\\b(?:his|her|client'?s|patient'?s|caller'?s)\\s+(?:\\w+\\s+)?${DIAGNOSIS.source}`, "i");
const AFTER_SUBJECT = new RegExp(`^(?:\\W+\\w+){0,2}?\\W+${HAS}\\b(?:\\W+\\w+){0,3}?\\W+${DIAGNOSIS.source}`, "i");
// Initials as a subject: "J.R. has anxiety", "JR has panic disorder" (not "I").
const INITIALS = /(?<![\p{L}\p{N}.])(?:\p{Lu}\.){1,3}|(?<![\p{L}\p{N}])\p{Lu}{2,3}(?![\p{L}\p{N}])/gu;

function initialsCondition(sentence: string): boolean {
  for (const m of sentence.matchAll(INITIALS)) {
    if (AFTER_SUBJECT.test(sentence.slice((m.index ?? 0) + m[0].length))) return true;
  }
  return false;
}

/** A diagnosis word or ICD-10 code anywhere in the text. */
export function mentionsDiagnosis(text: string): boolean {
  return ICD10.test(text) || DIAGNOSIS.test(text);
}

/**
 * A named person who has a condition: "Gary Bucher has bipolar disorder",
 * "Gary Bucher's PTSD". A provider's work ("Gary Bucher sees adults with
 * anxiety") is not having it.
 */
export function namedCondition(name: string, text: string): boolean {
  const who = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)?\\b(?:\\W+\\w+){0,2}?\\W+${HAS}\\b(?:\\W+\\w+){0,3}?\\W+${DIAGNOSIS.source}`, "iu");
  const owns = new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)\\s+(?:\\w+\\s+)?${DIAGNOSIS.source}`, "iu");
  return has.test(text) || owns.test(text) || (DIAGNOSED.test(text) && new RegExp(`(?<![\\p{L}\\p{N}])${who}`, "iu").test(text));
}

function hasDiagnosis(text: string): boolean {
  if (ICD10.test(text)) return true;
  return sentences(text).some((sentence) => {
    if (!DIAGNOSIS.test(sentence)) return false;
    if (DIAGNOSED.test(sentence) || HAS_CONDITION.test(sentence) || OWNS_CONDITION.test(sentence) || initialsCondition(sentence)) return true;
    return ONE_CLIENT.test(sentence) || (PRONOUN.test(sentence) && !PRACTICE_TOPIC.test(sentence));
  });
}

// ---- identifiers, contacts, addresses ----------------------------------------

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const SSN_WORDS = /\b(ssn|social security)\b[^0-9]{0,20}\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/i;
const RECORD_ID =
  /\b(member|policy|subscriber|mrn|medical record|chart|patient|client)\s*(?:id|number|no\.?|#)?\s*(?:is\s+)?[:#]?\s*(?=[A-Z0-9-]*\d)[A-Z0-9-]{5,}\b/i;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Any US phone shape: separated, mixed or 10 bare digits.
const PHONE = /(?<![\d-])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?![\d-])/g;
// Fully separated ("312-555-0199", "(312) 555-0199"): always a phone number.
const SEPARATED = /(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}$/;
// A bare or half-separated number ("3125550199", "312 5550199") is a phone
// when the sentence is about reaching someone, and not an NPI or other ID.
const CONTACT_WORDS = /\b(cell|phone|mobile|number|text\w*|call\w*|reach|contact|from|at|her|his|she|he|client|caller)\b/i;
const ID_CONTEXT = /\b(NPI|EIN|TIN|CAQH|PTAN|license|member|policy|claim|account|routing|tax)\b/i;
/**
 * Official lines, matched exactly: the Illinois DCFS child abuse hotline
 * (1-800-252-2873), the former National Suicide Prevention Lifeline number
 * (1-800-273-8255, now 988), 1-800-MEDICARE (1-800-633-4227), and the payer
 * phone numbers in data/payers (tests/guard-precision.test.ts keeps them in sync).
 * 988 and 911 are three digits and never look like a phone number.
 */
export const OFFICIAL_PHONES: ReadonlySet<string> = new Set([
  "8002522873", "8002738255", "8006334227",
  "8887367499", "8557455507", "8777825565", "8888749378",
]);
const STREET_SUFFIX = "(?:St|Street|Ave|Av|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Hwy|Highway)";
const STREET_NAME = "\\d{1,5}\\s+(?:[NSEW]\\.?\\s+)?[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*";
const UNIT = "(?:,?\\s+(?:Apt|Apartment|Unit|Ste|Suite|#)\\.?\\s*#?\\s*\\w+)";
const STREETS = [
  new RegExp(`\\b${STREET_NAME}\\s+${STREET_SUFFIX}\\b\\.?${UNIT}?`, "g"),
  new RegExp(`\\b${STREET_NAME}${UNIT}`, "g"),
  // "her address is 1200 Fullerton", "lives at 1200 Fullerton"
  new RegExp(`(?<=\\b(?:[Aa]ddress|[Ll]ives|[Ll]iving|[Rr]esides|[Hh]ome)(?:\\s+(?:is|at|on)\\s+|\\s*:\\s*))${STREET_NAME}`, "g"),
];
const RESIDENCE = /\b(address|lives?|living|home|resid\w*)\b/i;

const digits = (s: string) => s.replace(/\D/g, "");

function hasForeignContact(text: string, allow: Allowlist): boolean {
  const ownEmails = allow.contacts.map((c) => c.toLowerCase());
  const ownPhones = allow.contacts.map(digits).filter((d) => d.length >= 10).map((d) => d.slice(-10));
  for (const m of text.matchAll(EMAIL)) if (!ownEmails.includes(m[0].toLowerCase())) return true;
  for (const m of text.matchAll(PHONE)) {
    const number = digits(m[0]).slice(-10);
    if (OFFICIAL_PHONES.has(number) || ownPhones.includes(number)) continue;
    if (SEPARATED.test(m[0])) return true;
    const sentence = sentenceAt(text, m.index ?? 0);
    if (CONTACT_WORDS.test(sentence) && !ID_CONTEXT.test(sentence)) return true;
  }
  return false;
}

function hasClientAddress(text: string, allow: Allowlist): boolean {
  const own = allow.contacts.map((c) => c.toLowerCase());
  for (const pattern of STREETS) {
    for (const m of text.matchAll(pattern)) {
      const found = m[0].toLowerCase().replace(/\.$/, "").trim();
      if (own.some((c) => c.includes(found) || found.includes(c))) continue;
      if (PERSON_REF.test(text) || RESIDENCE.test(text)) return true;
    }
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
