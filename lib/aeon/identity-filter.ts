// Layer 1 of the sensitive-info guard: plain-code rules, no model, no network.
// Built from the HIPAA Safe Harbor identifiers (45 CFR 164.514(b)(2)) that can
// show up in a chat, plus diagnoses tied to a person. Until there is a BAA,
// Aeon keeps practice-business facts only (AGENTS.md > Aeon's memory).
// Layer 2 (phi-classifier.ts) catches bare names these rules can't.
//
// Default refuse: every exemption is narrow and positive (her own contacts, an
// official agency line, a sentence about her own services). A false block is
// acceptable; a leak isn't.
import ilPayers from "../../data/payers/il.json";
import nationalPayers from "../../data/payers/national.json";

export type PhiKind = "birth_date" | "client_name" | "diagnosis" | "identifier" | "contact" | "address" | "identifying";
export type PhiCheck = { ok: true } | { ok: false; kind: PhiKind };
export const ALL_KINDS: readonly PhiKind[] = ["birth_date", "client_name", "diagnosis", "identifier", "contact", "address", "identifying"];

/** Names and contact details that belong to the practice: her profile and her Referrals list. */
export type Allowlist = {
  names: string[];
  contacts: string[];
  /** The names in `names` that come from her Referrals board: public directory (NPPES) data, allowed only in a referral context. */
  directory?: string[];
};

// ---- sentences ---------------------------------------------------------------

// A dot ends a sentence unless it belongs to a title or an initial ("Dr.", "J.R.").
const NO_STOP_BEFORE = /(?:^|[^\p{L}])(?:\p{Lu}|Dr|Mr|Ms|Mrs|Mx|Prof|Rev|Fr|Sr|Jr|Hon|St|Ave|Av|Apt|vs|No)$/u;

// ---- misspelled cue words ------------------------------------------------------

// The words the rules key on, so a typo ("clinet", "depresion", "cancr") can't
// slip past them. A word one edit away (a letter added, dropped, changed or two
// swapped) is read as the cue word. Only words of 5 letters or more, so short
// words don't overmatch, and never a real word that is one edit away
// ("patent", "cancel", "addition", "dancer"): the list was checked against a
// dictionary.
const CUE_WORDS = (
  "client clients patient patients therapy therapist diagnosis diagnosed depression depressed depressive anxiety anxious " +
  "bipolar schizophrenia postpartum trauma autism autistic anorexia bulimia dementia psychosis addiction addicted insomnia " +
  "disorder alcoholic cancer chemo chemotherapy radiation metastatic dialysis pregnant pregnancy miscarriage leukemia lymphoma " +
  "mastectomy remission diabetes hospice"
).split(" ");
const REAL_WORDS = new Set(
  (
    "clint patent patents satient diagnose diagnoses degression repression repressed repressive degressive dipolar " +
    "schizophrenic taruma trama autist mutism artistic mutistic bulimic psychoses addition adduction insomniac misorder " +
    "cancel cancels caner canker canner canter chancer dancer lancer rancer hemotherapy adiation eradiation radication " +
    "regnant pregnance regnancy mismarriage leucemia leukemic demission emission recission reomission"
  ).split(" "),
);

/** One edit apart (insert, delete, change, or swap two neighbours). */
function oneEdit(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  if (a.length === b.length) {
    const diff: number[] = [];
    for (let i = 0; i < a.length && diff.length < 3; i++) if (a[i] !== b[i]) diff.push(i);
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]];
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < s.length && s[i] === l[i]) i++;
  return s.slice(i) === l.slice(i + 1);
}

/** Misspelled cue words read as the word they almost are ("my clinet" is "my client"). For checking only. */
export function foldTypos(text: string): string {
  return text.replace(/\p{L}{5,}/gu, (w) => {
    const low = w.toLowerCase();
    if (REAL_WORDS.has(low) || CUE_WORDS.includes(low)) return w;
    const cue = CUE_WORDS.find((c) => oneEdit(low, c));
    if (!cue) return w;
    return /^\p{Lu}/u.test(w) ? cue[0].toUpperCase() + cue.slice(1) : cue;
  });
}

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

/** Keys written in code ("date_of_birth", "dateOfBirth") read as words, for the rules. */
function keysAsWords(text: string): string {
  return text.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

// ---- people words ------------------------------------------------------------

// One identifiable person (singular). Plurals ("clients", "adults") and a bare
// "child" in a legal answer are a population or a topic.
const ONE_PERSON_WORDS =
  "client|patient|caller'?s?|son|daughter|husband|wife|spouse|partner|girlfriend|boyfriend|fianc[eé]e?|ex|mom|dad|mother|father|" +
  "grandma|grandpa|grandmother|grandfather|aunt|uncle|stepson|stepdaughter|stepmom|stepdad|someone|somebody|" +
  "teen|teenager|guy|toddler|kid|boy|girl|baby|infant|nephew|niece|grandson|granddaughter|brother|sister|cousin|roommate|co-?worker|boss|" +
  "\\d{1,2}[- ]?(?:year|yr)s?[- ]?old|(?:my|the|our)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|o['’]?clock)|the\\s+one\\s+(?:on|who|from|with)|" +
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

// A population or her services, not one person: "I help someone with anxiety",
// "a teen with ADHD", "my ideal client struggles with anxiety". Any sign of one
// real person (of mine, a day or time, a visit, an event) makes it specific.
const SERVICE_SENTENCE = /\b(?:I|I'm|we|we're|my practice|our practice)\b.*\b(?:help\w*|work\w*\s+with|see|speciali[sz]\w*|treat\w*|serv\w*|support\w*|focus\w*|offer\w*)\b/i;
const IDEAL_CLIENT = /\b(?:ideal|typical|usual|target)\s+(?:client|patient)s?\b/i;
const INDEFINITE = /\b(?:a|an|any)\s+(?:teen|teenager|adult|kid|child|client|patient|person|parent|couple|student|veteran|woman|man)\b|\bsomeone\s+(?:with|who)\b/i;
const SPECIFIC =
  /\b(?:of mine|my\s+(?:client|patient)|this\s+client|today|yesterday|tomorrow|tonight|this\s+(?:week|morning|afternoon|evening)|last\s+(?:week|night|session|time)|next\s+(?:week|session)|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|\d{1,2}\s*(?:am|pm)|at\s+\d|called|came|cancel\w*|missed|booked|wants|asked|emailed|texted|showed|no[- ]?show\w*|resched\w*|sessions?|appointments?|visits?|intake|named|whose)\b/i;

export function populationSentence(s: string): boolean {
  if (!(SERVICE_SENTENCE.test(s) || IDEAL_CLIENT.test(s) || INDEFINITE.test(s)) || SPECIFIC.test(s)) return false;
  // Any other person in it ("I help her with her anxiety") makes it about someone.
  const rest = s.replace(new RegExp(INDEFINITE.source, "gi"), " ").replace(new RegExp(IDEAL_CLIENT.source, "gi"), " ");
  return !ONE_CLIENT.test(rest) && !PRONOUN.test(rest);
}

// ---- dates -------------------------------------------------------------------

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MONTH = "(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?";
const MES = "(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)";
type Ymd = { y: number; m: number; d: number };
const DATE_READERS: [RegExp, (m: RegExpMatchArray) => Ymd][] = [
  // 3/14/1988, 07.02.90, 3-14-15, 3 14 1988
  [/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})\b/g, (m) => ({ y: fullYear(m[3]), m: Number(m[1]), d: Number(m[2]) })],
  [/\b(\d{1,2})\s+(\d{1,2})\s+(\d{4})\b/g, (m) => ({ y: Number(m[3]), m: Number(m[1]), d: Number(m[2]) })],
  // 1990-07-02
  [/\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b/g, (m) => ({ y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) })],
  // March 14, 1988
  [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), (m) => ({ y: Number(m[3]), m: monthOf(m[1]), d: Number(m[2]) })],
  // 14 March 1988, the 14th of March, 1988
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})\\b`, "gi"), (m) => ({ y: Number(m[3]), m: monthOf(m[2]), d: Number(m[1]) })],
  // 14 de marzo de 1988
  [new RegExp(`\\b(\\d{1,2})\\s+de\\s+${MES}\\s+(?:de\\s+|del\\s+)?(\\d{4})\\b`, "gi"), (m) => ({ y: Number(m[3]), m: Math.max(1, MESES.indexOf(m[2].toLowerCase().replace("setiembre", "septiembre")) + 1), d: Number(m[1]) })],
  // born in 1988
  [/\bborn\s+(?:in\s+)?(\d{4})\b/gi, (m) => ({ y: Number(m[1]), m: 1, d: 1 })],
];
const BIRTH_WORDS =
  /\b(born|dob|d\.\s?o\.\s?b\.?|birthday|birth\s?date|date of birth|naci[oó]|nacid[oa]|nacimiento|fecha de nacimiento)\b|(?:^|\s)b\.\s/i;
const MONTH_WORD = new RegExp(`\\b(?:${MONTH}|${MES})\\b`, "i");
// Dates about her own career, not anyone's birth: "Graduated 2006-05-14", "licensed 03/12/2008".
const CAREER_WORDS =
  /\b(graduat\w*|licen[sc]\w*|certif\w*|degree|credential\w*|diploma|board[- ]certified|enumerat\w*|attest\w*|renew\w*|exam|passed|hired|opened|founded|incorporat\w*|PLLC|LLC|NPI|issued|effective|registered|practicing\s+since)\b/i;

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

export function notFuture(d: Ymd, today = new Date()): boolean {
  const when = new Date(d.y, Math.max(0, d.m - 1), Math.max(1, d.d));
  return Number.isNaN(when.getTime()) || when.getTime() <= today.getTime();
}

function hasBirthDate(text: string, today = new Date()): boolean {
  return sentences(keysAsWords(text)).some((s) => {
    const dates = datesIn(s);
    // "born on the fourteenth of March": a birth word and a month, written out.
    if (dates.length === 0) return BIRTH_WORDS.test(s) && MONTH_WORD.test(s);
    if (BIRTH_WORDS.test(s)) return true;
    const person = PERSON_REF.test(s) || VISIT_WORDS.test(s);
    // Any full date before 2010, unless it's her own career ("licensed 03/12/2008").
    if (dates.some((d) => d.y >= 1900 && d.y < 2010) && (person || !CAREER_WORDS.test(s))) return true;
    // A past date next to a person or a visit ("Her son (3-14-15)", "(3/14/2015) canceled her visit").
    return person && dates.some((d) => notFuture(d, today));
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
  new RegExp(`\\b(?:[Mm]y|[Tt]he|[Oo]ur)\\s+\\d{1,2}(?::\\d{2})?\\s*(?:am|pm|o['’]?clock)\\b[\\s,:]+${NAME}`, "g"),
  new RegExp(`\\b(?:Mr|Ms|Mrs|Miss|Mx)\\.?\\s+${NAME}`, "g"),
];
const NAME_BEFORE = new RegExp(`${NAME}(?:\\s+is|,)\\s+(?:my|a|our)\\s+(?:client|patient)\\b`, "g");
// "my client maria g.": a first name and an initial after a client word, in any case.
const NAME_INITIAL_AFTER = /\b(?:client|patient|caller)s?\b(?:\s+(?:named|called|is))?[\s,:]+\p{L}{2,}\s+\p{L}\.(?=[\s,;:]|$)/iu;

const nameWords = (n: string) => n.toLowerCase().split(/[\s,.]+/).filter(Boolean);

/** Whole words of a listed name ("Ms. Shah" for "Priya Shah"), never a piece of one ("Dan" is not "Dana"). */
function isAllowedName(name: string, allow: Allowlist): boolean {
  const first = name.split(/\s+/)[0];
  if (NOT_NAMES.has(first)) return true;
  const words = nameWords(name);
  return allow.names.some((n) => {
    const known = nameWords(n);
    return words.every((w) => known.includes(w));
  });
}

// "my client Gary Bucher": a name she calls a client is a client's, even when
// the same name is on her Referrals board (a provider is never "my client").
// Only a title ("Ms. Shah") falls back to the list, so a source can be named so.
const CLIENT_PATTERNS = new Set([NAME_AFTER[0], NAME_AFTER[1], NAME_BEFORE]);
// "the 9 year old from Lincoln Elementary": an age and a school name one child.
const AGE = /\b\d{1,2}[- ]?(?:year|yr)s?[- ]?old\b/i;
const SCHOOL = /\b(elementary|middle school|high school|school|academy|kindergarten|preschool|daycare|grade)\b/i;
// A run of letters in a non-Latin script ("王伟", "Иван Петров") in a sentence
// about a person or a visit: the name-finder reads Latin letters only.
const NON_LATIN =
  /[\p{Script=Han}\p{Script=Cyrillic}\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Devanagari}\p{Script=Greek}\p{Script=Armenian}\p{Script=Georgian}\p{Script=Bengali}\p{Script=Tamil}\p{Script=Ethiopic}]{2,}/u;
const ABOUT_SOMEONE = /\b(wants?|prefers?|asked|called|texted|emailed|booked|paid|owes|came|cancel\w*|missed)\b/i;

function hasClientName(text: string, allow: Allowlist): boolean {
  for (const pattern of [...NAME_AFTER, NAME_BEFORE]) {
    for (const m of text.matchAll(pattern)) {
      const allowed = CLIENT_PATTERNS.has(pattern) ? NOT_NAMES.has(m[1].split(/\s+/)[0]) : isAllowedName(m[1], allow);
      if (!allowed) return true;
    }
  }
  if (NAME_INITIAL_AFTER.test(text)) return true;
  return sentences(text).some(
    (s) => (AGE.test(s) && SCHOOL.test(s)) || (NON_LATIN.test(s) && (PERSON_REF.test(s) || CLIENT_SIGNAL.test(s) || ABOUT_SOMEONE.test(s))),
  );
}

/** "my client", "our patient": any name in such a sentence is a client's. */
export const MY_CLIENT = /\b(?:my|our)\s+(?:client|patient)s?\b/i;

// What a client's sentence looks like: a visit, a cancellation, a bill, a
// condition, scheduling. Her own name is checked against OWN_SIGNAL (so "Book a
// first session with Dana Reyes, LCPC" passes); everyone else against CLIENT_SIGNAL.
const OWN_SIGNAL =
  /\b(?:my|our|this|her|his|their)\s+(?:client|patient)\b|\b(?:came|come|comes|coming)\s+in\b|\bcancel(?:s|ed|led|ing)?\b|\bresched\w*|\bno[- ]?shows?\b|\bmissed\b|\binvoices?\b|\bowes?\b|\bbalance\b|\bstruggl\w*|\bdiagnos\w*|\bdob\b|\bborn\b|\bwants?\b|\bprefers?\b|\bcall(?:s|ed)?\s+(?:\w+\s+)?back\b|\b(?:after|before)\s+\d|\b(?:her|his|their)\s+(?:\w+\s+){0,2}?(?:slot|appointment|appt|session|visit|consult|intake|therapy|therapist|treatment|meds|medication)s?\b/i;
const CLIENT_SIGNAL = new RegExp(`${OWN_SIGNAL.source}|\\b(?:visits?|appointments?|appts?|sessions?|consults?|intake|checked\\s+in|paid|late|copays?|superbills?|good faith estimates?|GFE)\\b`, "i");

/** A sentence that treats someone as a client. `own`: her own name, judged more loosely. */
export function clientLike(sentence: string, own = false): boolean {
  if ((own ? OWN_SIGNAL : CLIENT_SIGNAL).test(sentence)) return true;
  // A name with a past date beside it ("(3/14/2015) Jess wants Tuesdays") may be a birth date.
  if (!own && datesIn(sentence).some((d) => notFuture(d))) return true;
  return mentionsDiagnosis(sentence) && !(own && PRACTICE_TOPIC.test(sentence));
}

// Her own first name or surname alone passes only in a sentence clearly about
// her: I/my, her license, fees, hours, profile, posts and letters.
const OWN_CONTEXT =
  /\b(I|I'm|I am|my|me|myself|licen[sc]\w*|fees?|rates?|hours|profile|practice|office|bio|headshot|website|post|caption|signature|letter|hi|hello|meet|from|LCPC|LCSW|LICSW|LPC|LMFT|PhD|PsyD|PLLC|therapist|clinician|counselor|owner|founder|credential\w*|CAQH|NPI|demo|fictional)\b/i;

export function ownContext(sentence: string): boolean {
  return OWN_CONTEXT.test(sentence);
}

// A sentence where a provider on her board belongs: their card, a letter,
// outreach, their office, specialty or NPI. Only here is a board name directory data.
const REFERRAL_CONTEXT =
  /\b(cards?|board|letters?|referr\w*|refers?|NPI|NPPES|outreach|practice|office|address|speciali[sz]\w*|specialt\w*|accepting|e-?mail|phone|fax|follow[- ]?ups?|call log|contact\w*|providers?|directory|status|colleagues?|network|introduc\w*|reach(?:ed)?\s+out|stage|column|pipeline|do not contact|LCSW|LICSW|LCPC|LPC|LMFT|MD|PhD|PsyD|chaplains?|reverend|navigators?|genetic\s+counsel\w*|social\s+workers?|oncolog\w*|hospice|palliative|miles?\s+away|\d+(?:\.\d+)?\s*mi)\b/i;
// A professional's credential after a name ("Brittany Keiser, MS, CGC", "Renata
// Ostrowski, RN", "Rev. Tobias Wren"). Case-sensitive, so "do" and "ms" as words don't count.
export const PROFESSIONAL_CREDENTIAL =
  /\b(?:MD|DO|PhD|PsyD|EdD|DNP|RN|BSN|MSN|NP|APRN|PMHNP|FNP|PA-C|CGC|MSGC|MS|MA|MSW|LSW|LCSW|LICSW|LCPC|LPC|LPCC|LMHC|LMFT|CNS|BCC|MDiv|Rev)(?![\p{L}\p{N}-])|\bRev\.|\b(?:[Cc]haplain|[Rr]everend)\b/u;

export function referralContext(sentence: string): boolean {
  return REFERRAL_CONTEXT.test(sentence) || PROFESSIONAL_CREDENTIAL.test(sentence);
}

// "my supervisor Jenna Cho, LCSW": a colleague named with role and credential.
const COLLEAGUE_ROLE =
  /\bmy\s+(?:clinical\s+)?(?:supervisor|consultant|colleague|covering\s+(?:clinician|therapist)|biller|billing\s+(?:assistant|service)|attorney|lawyer|CPA|accountant|bookkeeper)\s*,?\s*$/i;
const CREDENTIAL_AFTER = /^,?\s*(?:LCSW|LICSW|LCPC|LPC|LPCC|LMFT|LMHC|PhD|PsyD|MD|CPA|JD|Esq\.?|EA|CPC|CMA)\b/;

/** The name at `at` is introduced as her colleague with a credential, outside any client sentence. */
export function colleagueAt(text: string, at: number, name: string): boolean {
  if (!COLLEAGUE_ROLE.test(text.slice(Math.max(0, at - 40), at))) return false;
  if (!CREDENTIAL_AFTER.test(text.slice(at + name.length))) return false;
  return !clientLike(sentenceAt(text, at));
}

// ---- diagnoses ---------------------------------------------------------------

// ICD-10-CM with the decimal point (F41.1), and without it for the mental
// health, symptom and social-context chapters (F411, Z6372, R45851). Bare "F41"
// is too close to everyday codes, and G and H codes are HCPCS billing codes.
const ICD10 = /\b[A-TV-Z][0-9][0-9A-Z]\.[0-9A-Z]{1,4}\b|\b[FZR][0-9]{2}[0-9A-Z]{1,4}\b/;
const DIAGNOSIS =
  /\b(depression|depressive|depressed|mdd|anxiety|anxious|gad|ptsd|c-?ptsd|trauma\s+history|history\s+of\s+trauma|bipolar|schizo\w*|adhd|ocd|bpd|borderline|autism|autistic|anorexia|anorexic|bulimia|bulimic|binge eating|eating disorder|psychosis|psychotic|dementia|panic disorder|panic attacks?|phobias?|agoraphobia|insomnia|grief|bereavement|disorder|sud|substance use|alcohol use|opioid use|alcoholism|alcoholic|addiction|addicted|self[- ]?harm|self[- ]?injury)\b/i;
// "was diagnosed" or "dx" on its own refuses; a record label too ("Diagnosis: ...").
// The bare noun ("90839 needs a diagnosis") and "dx code" are billing talk.
const DIAGNOSED = /\bdiagnosed\b|\bdx\b(?!\s+codes?)|\bdiagnos[ie]s\s*[:#]/i;
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

// ---- medical conditions (only about one person) --------------------------------

// Her niche is people facing cancer, serious illness and end of life, so these
// words are everyday referral talk ("oncologists near me", "I help people with
// cancer", "a hospice team"). They count only when they are about one client,
// patient or a client's relative ("my client just started chemo", "her breast
// cancer", "client's mom, 61, with metastatic cancer").
const MEDICAL_SOURCE =
  "(?:cancers?|carcinomas?|tumou?rs?|malignan\\w*|metasta\\w*|chemo\\w*|radiation(?!\\s+oncolog)(?:\\s+(?:therapy|treatment))?|radiotherapy|immunotherapy|" +
  "stage\\s+(?:[1-4]|i{1,3}|iv|one|two|three|four)(?![\\p{L}\\p{N}])|terminal(?:ly)?\\s+ill\\w*|terminal\\s+(?:cancer|diagnosis|illness|condition)|is\\s+terminal|end[- ]stage|" +
  "dialysis|kidney\\s+failure|hiv|pregnan\\w*|miscarri\\w*|post-?partum|stillbirth|infertil\\w*|ivf|mastectom\\w*|lumpectom\\w*|hysterectom\\w*|" +
  "leuka?emia|lymphoma|melanoma|sarcoma|myeloma|glioblastoma|in\\s+remission|relapsed?|" +
  "(?:in|on|entering|entered|into|enrolled\\s+in)\\s+hospice|hospice\\s+patient|palliative\\s+(?:care\\s+)?patient|on\\s+palliative(?:\\s+care)?|" +
  "diabet\\w*|strokes?|heart\\s+attack|seizures?|epilep\\w*|parkinson['’]?s|alzheimer['’]?s|multiple\\s+sclerosis|transplant|amputat\\w*|" +
  "chronic\\s+(?:pain|illness)|lupus|breast\\s+ca)(?![\\p{L}\\p{N}])";
const MEDICAL = new RegExp(`(?<![\\p{L}\\p{N}])${MEDICAL_SOURCE}`, "iu");
// Places, programs and roles are referral talk, not anyone's condition: "cancer
// center", "patient navigator", "radiation oncology", "a hospice social worker".
const MEDICAL_PLACES =
  /\b(?:cancer|oncology|hospice|palliative|dialysis|transplant|diabetes|stroke|radiation|chemo(?:therapy)?|infusion|breast|maternity|pregnancy|fertility|HIV|surgery|surgical)\s+(?:cent(?:er|re)s?|care(?:\s+(?:cent(?:er|re)s?|teams?|programs?))?|institutes?|society|support|groups?|programs?|clinics?|hospitals?|units?|teams?|services|networks?|alliances?|foundations?|wellness|navigators?|nurses?|social\s+workers?|counselors?|specialists?|survivorship|resources?|research|ward|floor|practices?|offices?|departments?|partners?|providers?|doctors?|physicians?|surgeons?|oncologists?|experts?|advocates?|coaches?|educators?|doulas?|researchers?|patients|survivors|clients|families)\b|\bpatient\s+(?:navigators?|advocates?|care|services|portal|education|experience|relations|intake|coordinators?|liaisons?|family|families|support)\b|\b(?:radiation|surgical|medical|gynecologic|pediatric|hematology)[- ]+oncolog\w*/gi;
const RELATIVES =
  "mom|mother|dad|father|son|daughter|husband|wife|spouse|sister|brother|grandma|grandpa|grandmother|grandfather|aunt|uncle|niece|nephew|cousin|" +
  "child|kid|baby|infant|toddler|teen|teenager|stepson|stepdaughter|stepmom|stepdad|fianc[eé]e?|girlfriend|boyfriend|grandson|granddaughter|parent";
const AGE_WORDS = "\\d{1,3}\\s*(?:yo|y/o|y\\.o\\.?|yrs?\\s*old|years?[- ]old|year-old)(?![\\p{L}\\p{N}])";
// "45F", "a 61 M": age and sex written as a chart would.
const AGE_SEX = /\b\d{1,3}\s?[MF]\b/;
const MED_PERSON = new RegExp(`\\b(?:client|patient|caller|${RELATIVES})(?:['’]s)?(?![\\p{L}\\p{N}])|${AGE_WORDS}`, "iu");
// "a patient", "each client", "any parent": a population, unless the sentence is specific.
const GENERIC_PERSON = new RegExp(`\\b(?:a|an|any|each|every|another|the\\s+average)\\s+(?:new\\s+|typical\\s+)?(?:client|patient|person|parent|child|kid|teen|adult)\\b(?!\\s+of\\s+mine)`, "gi");
const POSSESSIVE_MEDICAL = new RegExp(
  `\\b(?:his|her|client['’]?s|patient['’]?s|(?:${RELATIVES})['’]s)\\s+(?:[\\p{L}-]+\\s+)?${MEDICAL_SOURCE}(?!\\s+(?:patients|clients|survivors|families|population|research|specialists?|doctors?|nurses?))`,
  "iu",
);
// "she just started chemo", "he is in hospice", "she's pregnant". Her work
// ("she treats breast cancer", "he has worked with cancer patients") is not having it.
const PRACTICE_VERB = "(?:treat|help|work|serv|support|see|focus|speciali[sz]|train|offer|care\\s+for|car(?:e|es|ing)\\s+for)";
const PRONOUN_MEDICAL = new RegExp(
  `\\b(?:he|she)\\b(?:['’]s\\b|(?:\\W+(?!${PRACTICE_VERB})\\w+){0,1}?\\W+(?:${HAS}|is|was|just|recently|started|starting|finished|began|getting|undergoing|receiving|going\\s+through)\\b)(?:\\W+(?!${PRACTICE_VERB})\\w+){0,3}?\\W+${MEDICAL_SOURCE}`,
  "iu",
);

/** A medical-condition word anywhere (places and roles left out). Not a refusal on its own. */
export function mentionsMedical(text: string): boolean {
  return MEDICAL.test(text.replace(MEDICAL_PLACES, " "));
}

/**
 * A medical condition about one person: a client, a patient or a client's
 * relative ("my client has stage 3 breast cancer", "client's mom ... metastatic
 * breast cancer", "she just started chemo", "his chemo"). "I help people with
 * cancer", "oncologists near me", "patients in active treatment" and "a patient
 * with stage 3 cancer, who should they see first?" are not.
 */
export function medicalAboutSomeone(sentence: string): boolean {
  const s = sentence.replace(MEDICAL_PLACES, " ");
  if (!MEDICAL.test(s)) return false;
  if (POSSESSIVE_MEDICAL.test(s) || PRONOUN_MEDICAL.test(s) || AGE_SEX.test(s)) return true;
  const named = s.replace(GENERIC_PERSON, " ");
  if (MED_PERSON.test(named)) return true;
  // Only "a patient" or "each client": a question about a kind of person, unless something pins one down.
  return named !== s && SPECIFIC.test(s) && !PRACTICE_TOPIC.test(s);
}

// ---- indirect identifiers ---------------------------------------------------------

// One of her clients (or a client's relative), with anything that narrows them
// down: an age, a job or employer, a place, a condition. "my client's mom, a 61
// yo retired CPS teacher in Lincoln Park" names no one and still points at one person.
const CLIENT_CUE = new RegExp(
  `\\b(?:my|our|your|this|that)\\s+(?:(?:new|current|former|old|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm))\\s+)?(?:(?:client|patient)(?:['’]s)?(?![\\p{L}\\p{N}])|(?:client|patient)s['’]?\\s+(?:${RELATIVES})\\b)|` +
    `\\b(?:client|patient)['’]s\\s+(?:${RELATIVES})\\b|\\b(?:a|one)\\s+(?:client|patient)\\s+of\\s+mine\\b|\\bone\\s+of\\s+my\\s+(?:clients|patients)\\b`,
  "iu",
);
const AGE_Q = new RegExp(`${AGE_WORDS}|\\bin\\s+(?:her|his|their)\\s+(?:early\\s+|mid\\s+|late\\s+)?(?:\\d0['’]?s|twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\\b|\\baged?\\s+\\d{1,3}\\b|,\\s*\\d{2}\\s*,`, "iu");
const JOB_Q =
  /\b(?:retired|works?\s+(?:at|for|as)|working\s+(?:at|for|as)|employed\s+(?:at|by)|employer|job\s+at|teachers?|nurses?|firefighters?|police|officers?|cops?|lawyers?|attorneys?|engineers?|professors?|pastors?|physicians?|surgeons?|accountants?|veterans?|soldiers?|students?|CPS|CTA|aldermen|alderman|judges?|bankers?|chefs?|pilots?|musicians?|athletes?|coach|principal|librarians?|cashiers?|drivers?|mechanics?|electricians?|plumbers?|bartenders?|servers?|waitress|waiter)\b/i;
const US_STATES =
  "Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|" +
  "Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New\\s+Hampshire|New\\s+Jersey|New\\s+Mexico|New\\s+York|North\\s+Carolina|North\\s+Dakota|" +
  "Ohio|Oklahoma|Oregon|Pennsylvania|Rhode\\s+Island|South\\s+Carolina|South\\s+Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West\\s+Virginia|Wisconsin|Wyoming";
const NOT_PLACES = `(?:${US_STATES}|January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|I|The|A|An|My|Our|Network|Person|Spanish|English|Polish|French|Chinese|Mandarin|Cantonese|Korean|Arabic|Russian|Hindi|Urdu|Tagalog|Vietnamese|ASL|Zoom|Telehealth|Medicare|Medicaid|Aetna|Cigna|Blue|United|Humana|Tricare|Network)\\b`;
// "lives in", "in Lincoln Park", "from Rogers Park". A state is a licensing question, not a place to find someone.
const PLACE_Q = new RegExp(`\\b(?:lives?|living|resides?|moved)\\s+(?:in|on|near|at|to)\\b|\\b(?:in|from|near)\\s+(?:the\\s+)?(?!${NOT_PLACES})\\p{Lu}\\p{Ll}+`, "u");

/** One client (or a client's relative) plus an age, job, place or condition. */
export function indirectIdentifiers(sentence: string): boolean {
  if (!CLIENT_CUE.test(sentence)) return false;
  return AGE_Q.test(sentence) || AGE_SEX.test(sentence) || JOB_Q.test(sentence) || PLACE_Q.test(sentence) || DIAGNOSIS.test(sentence) || mentionsMedical(sentence);
}

// "Tuesday 4pm client", "my 3pm patient": a time slot that points at one client, in memory.
const TIMESLOT_CLIENT =
  /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?)\s+(?:client|patient)\b(?!\s+(?:sessions?|slots?|hours?|intakes?|forms?|calls?|appointments?|times?|days?|availability))/i;
const TIME_CUE = /\b(?:mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?|\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tonight|yesterday|tomorrow|(?:last|next|this)\s+(?:week|month|session))\b/i;

/**
 * A named person who has a condition: "Gary Bucher has bipolar disorder",
 * "Gary Bucher's PTSD". A provider's work ("Gary Bucher sees adults with
 * anxiety") is not having it.
 */
export function namedCondition(name: string, text: string): boolean {
  const who = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const has = new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)?\\b(?:\\W+\\w+){0,2}?\\W+${HAS}\\b(?:\\W+\\w+){0,3}?\\W+${DIAGNOSIS.source}`, "iu");
  const owns = new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)\\s+(?:\\w+\\s+)?${DIAGNOSIS.source}`, "iu");
  // "Gordon is in hospice", "Tellez just started chemo", "Gordon's breast cancer".
  const plain = text.replace(MEDICAL_PLACES, " ");
  const medical =
    new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)?\\b(?:\\W+(?!${PRACTICE_VERB})\\w+){0,1}?\\W+(?:${HAS}|is|was|just|recently|started|starting|finished|began|getting|undergoing|receiving|going\\s+through)\\b(?:\\W+(?!${PRACTICE_VERB})\\w+){0,2}?\\W+${MEDICAL_SOURCE}`, "iu").test(plain) ||
    new RegExp(`(?<![\\p{L}\\p{N}])${who}(?:'s|’s)\\s+(?:[\\p{L}-]+\\s+)?${MEDICAL_SOURCE}`, "iu").test(plain);
  return medical || has.test(text) || owns.test(text) || (DIAGNOSED.test(text) && new RegExp(`(?<![\\p{L}\\p{N}])${who}`, "iu").test(text));
}

function hasDiagnosis(text: string): boolean {
  return sentences(text).some((sentence) => {
    const population = populationSentence(sentence);
    if (ICD10.test(sentence) || DIAGNOSED.test(sentence)) return !population || ICD10.test(sentence);
    if (medicalAboutSomeone(sentence)) return true;
    if (!DIAGNOSIS.test(sentence) || population) return false;
    if (HAS_CONDITION.test(sentence) || OWNS_CONDITION.test(sentence) || initialsCondition(sentence)) return true;
    return ONE_CLIENT.test(sentence) || (PRONOUN.test(sentence) && !PRACTICE_TOPIC.test(sentence));
  });
}

/**
 * Clinical content with no name at all ("panic attacks every Tuesday at 4,
 * rescheduling"): fine to ask about in the chat, never kept in memory, which
 * holds practice-business facts only. Her niche ("I specialize in anxiety") is one.
 */
export function clinicalForMemory(text: string): boolean {
  return sentences(text).some(
    (s) =>
      ((mentionsDiagnosis(s) || DIAGNOSED.test(s)) && !populationSentence(s) && !(PRACTICE_TOPIC.test(s) && !SPECIFIC.test(s))) ||
      // A medical condition about one person, a client pinned down by details, a
      // "Tuesday 4pm client", or a condition tied to a day or time ("chemo Tuesdays at 4").
      medicalAboutSomeone(s) ||
      indirectIdentifiers(s) ||
      TIMESLOT_CLIENT.test(s) ||
      (mentionsMedical(s) && TIME_CUE.test(s) && !populationSentence(s)),
  );
}

// ---- identifiers, contacts, addresses ----------------------------------------

const SSN = /\b\d{3}[-.\s]\d{2}[-.\s]\d{4}\b/;
const SSN_WORDS = /\b(ssn|social security)\b[^0-9]{0,20}\d{3}[\s.-]?\d{2}[\s.-]?\d{4}\b/i;
// Medicare Beneficiary Identifier: 1EG4-TE5-MK73.
const MBI = /\b\d[A-Z][A-Z0-9]\d-?[A-Z][A-Z0-9]\d-?[A-Z]{2}\d{2}\b/i;
const PAYER_NAMES =
  "medicare|medicaid|aetna|cigna|evernorth|bcbs\\w*|blue\\s+cross|blue\\s+shield|uhc|united\\s*healthcare|optum|humana|tricare|triwest|meridian|molina|centene|ambetter|countycare|magellan|carelon|beacon|oscar|insurance|plan";
// After a record word (member, policy, MRN...), or a payer name with "ID", "#"
// or "number": the next one to three tokens, with at least three digits
// ("member ID XGH 123456789", "MRN 4817", "Aetna ID 4837201956").
const ID_LEAD = new RegExp(
  `\\b(?:(?:member|policy|subscriber|mrn|medical\\s+record|chart|patient|client|group|mbi|medicare\\s+beneficiary)\\s*(?:id|number|no\\.?|#)?|(?:${PAYER_NAMES})\\s+(?:member\\s+)?(?:id|number|no\\.?|#))\\s*(?:is\\s+)?[:#]?\\s*`,
  "gi",
);

function hasRecordId(text: string): boolean {
  for (const m of text.matchAll(ID_LEAD)) {
    const rest = text.slice((m.index ?? 0) + m[0].length);
    const tokens = /^([A-Z0-9][A-Z0-9-]*(?:\s[A-Z0-9][A-Z0-9-]*){0,2})/i.exec(rest)?.[1].split(/\s/) ?? [];
    const kept: string[] = [];
    for (const t of tokens) {
      if (!/\d/.test(t) && !/^[A-Z]{1,4}$/.test(t)) break;
      kept.push(t);
    }
    if ((kept.join("").match(/\d/g)?.length ?? 0) >= 3) return true;
  }
  return false;
}

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Any US phone shape: separated (. - / • · _ space), mixed or 10 bare digits.
const SEP = "[\\s./•·_-]";
const PHONE = new RegExp(`(?<![\\d-])(?:\\+?1${SEP}?)?(?:\\(\\d{3}\\)\\s?|\\d{3}${SEP}?)\\d{3}${SEP}?\\d{4}(?![\\d-])`, "g");
// A bare 10-digit number is a phone unless "NPI" is right before it.
const NPI_BEFORE = /\bNPI\b[^\d\n]{0,12}$/i;
// A payer's, agency's or provider line, with no person in the sentence:
// "BCBS provider line is 800-676-2583". A person's number never passes.
const PAYER_CONTEXT = new RegExp(
  `\\b(?:${PAYER_NAMES}|provider\\s+(?:line|services|relations)|customer\\s+service|claims|credentialing|enrollment|payer|insurer|IDFPR|DCFS|CMS|HFS|IMPACT|CAQH|Availity|PECOS|NPPES|Alma|Headway|Rula|SonderMind|Grow\\s+Therapy)\\b`,
  "i",
);

function digitsOf(s: string): string {
  return s.replace(/\D/g, "");
}

// Every phone number and email in the payer catalog (data/payers).
const CATALOG = JSON.stringify([ilPayers, nationalPayers]);
const CATALOG_PHONES = [...CATALOG.matchAll(/(?:1-)?\(?8\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}/g)].map((m) => digitsOf(m[0]).slice(-10));
const CATALOG_EMAILS = [...CATALOG.matchAll(EMAIL)].map((m) => m[0].toLowerCase());

/**
 * Official lines, matched exactly: the Illinois DCFS child abuse hotline
 * (1-800-252-2873), the former National Suicide Prevention Lifeline number
 * (1-800-273-8255, now 988), 1-800-MEDICARE (1-800-633-4227), and every phone
 * number in the payer catalog (data/payers). 988 and 911 never look like a phone.
 */
export const OFFICIAL_PHONES: ReadonlySet<string> = new Set(["8002522873", "8002738255", "8006334227", ...CATALOG_PHONES]);
/** Emails an agency or payer publishes: the payer catalog, and any .gov address. */
function officialEmail(email: string): boolean {
  const e = email.toLowerCase();
  return CATALOG_EMAILS.includes(e) || /\.gov$/.test(e);
}

const STREET_SUFFIX = "(?:St|Street|Ave|Av|Avenue|Rd|Road|Blvd|Boulevard|Dr|Drive|Ln|Lane|Ct|Court|Way|Pl|Place|Pkwy|Parkway|Ter|Terrace|Hwy|Highway)";
// Any case ("2847 w fargo ave", "2847 W FARGO AVE"): only the suffixes that aren't everyday words.
const ANY_CASE_SUFFIX = "(?:st|street|ave|av|avenue|rd|road|blvd|boulevard|drive|lane|court|terrace|parkway|pkwy|highway|hwy)";
const STREET_NAME = "\\d{1,5}\\s+(?:[NSEW]\\.?\\s+)?[A-Z][a-z]+(?:\\s+[A-Z][a-z]+)*";
const UNIT = "(?:,?\\s+(?:Apt|Apartment|Unit|#)\\.?\\s*#?\\s*\\w+)";
const STREETS = [
  new RegExp(`\\b${STREET_NAME}\\s+${STREET_SUFFIX}\\b\\.?${UNIT}?`, "g"),
  new RegExp(`\\b\\d{2,5}\\s+(?:[nsew]\\.?\\s+)?[a-z]+(?:\\s+[a-z]+){0,2}\\s+${ANY_CASE_SUFFIX}\\b\\.?${UNIT}?`, "gi"),
  new RegExp(`\\b${STREET_NAME}${UNIT}`, "g"),
  // "her address is 1200 Fullerton", "lives at 1200 Fullerton"
  new RegExp(`(?<=\\b(?:[Aa]ddress|[Ll]ives|[Ll]iving|[Rr]esides|[Hh]ome)(?:\\s+(?:is|at|on)\\s+|\\s*:\\s*))${STREET_NAME}`, "g"),
];
// An apartment or unit is a home: it refuses even with no person word nearby.
const HOME_UNIT = /\b(?:apt|apartment|unit)\b\.?\s*#?\s*\w+|#\s*\d+/i;
const RESIDENCE = /\b(address|lives?|living|home|resid\w*)\b/i;
// "she lives in 60614": a ZIP code tied to a person.
const PERSON_ZIP = /\b(?:lives?|living|resides?|home|zip(?:\s*code)?)\b[^.\n]{0,24}?\b\d{5}(?:-\d{4})?\b/i;

function phoneAllowed(m: RegExpMatchArray, text: string, ownPhones: string[]): boolean {
  const number = digitsOf(m[0]).slice(-10);
  if (OFFICIAL_PHONES.has(number) || ownPhones.includes(number)) return true;
  const at = m.index ?? 0;
  if (/^\d{10}$/.test(m[0]) && NPI_BEFORE.test(text.slice(Math.max(0, at - 20), at))) return true;
  const sentence = sentenceAt(text, at);
  return PAYER_CONTEXT.test(sentence) && !PERSON_REF.test(sentence);
}

function hasForeignContact(text: string, allow: Allowlist, phones = true): boolean {
  const ownEmails = allow.contacts.map((c) => c.toLowerCase());
  const ownPhones = allow.contacts.map(digitsOf).filter((d) => d.length >= 10).map((d) => d.slice(-10));
  for (const m of text.matchAll(EMAIL)) if (!ownEmails.includes(m[0].toLowerCase()) && !officialEmail(m[0])) return true;
  if (phones) for (const m of text.matchAll(PHONE)) if (!phoneAllowed(m, text, ownPhones)) return true;
  return false;
}

function streetsIn(text: string, allow: Allowlist): { found: string; at: number }[] {
  const own = allow.contacts.map((c) => c.toLowerCase());
  const out: { found: string; at: number }[] = [];
  for (const pattern of STREETS) {
    for (const m of text.matchAll(pattern)) {
      const found = m[0].toLowerCase().replace(/\.$/, "").trim();
      if (!own.some((c) => c.includes(found) || found.includes(c))) out.push({ found: m[0], at: m.index ?? 0 });
    }
  }
  return out;
}

function hasClientAddress(text: string, allow: Allowlist): boolean {
  if (sentences(text).some((s) => PERSON_ZIP.test(s) && PERSON_REF.test(s))) return true;
  return streetsIn(text, allow).some(({ found }) => HOME_UNIT.test(found) || PERSON_REF.test(text) || RESIDENCE.test(text));
}

/**
 * The checks every tool result gets, even from tools that return practice
 * records: a birth word with a date (keys such as date_of_birth included), an
 * email that isn't hers, her board's or an agency's, a home address, a phone or
 * email next to a person or "cell", or a condition someone has ("The teen has
 * ADHD"). Rule text and practice records (renewal dates, board phones, a law
 * that names a disorder) pass.
 */
export function personalDetail(text: string, allow: Allowlist = { names: [], contacts: [] }): PhiKind | null {
  const words = keysAsWords(text);
  for (const s of sentences(words)) {
    if (BIRTH_WORDS.test(s) && (datesIn(s).length > 0 || MONTH_WORD.test(s))) return "birth_date";
    if (HAS_CONDITION.test(s) || OWNS_CONDITION.test(s) || initialsCondition(s) || (DIAGNOSED.test(s) && DIAGNOSIS.test(s)) || medicalAboutSomeone(s)) {
      if (!populationSentence(s)) return "diagnosis";
    }
    if ((PERSON_REF.test(s) || /\b(cell|mobile)\b/i.test(s)) && hasForeignContact(s, allow)) return "contact";
  }
  if (hasForeignContact(text, allow, false)) return "contact";
  for (const { found, at } of streetsIn(text, allow)) {
    const s = sentenceAt(text, at);
    if (HOME_UNIT.test(found) || PERSON_REF.test(s) || /\b(lives?|living|home|resid\w*)\b/i.test(s)) return "address";
  }
  return null;
}

// ---- the check ---------------------------------------------------------------

export function checkIdentity(
  text: string,
  allow: Allowlist = { names: [], contacts: [] },
  only: readonly PhiKind[] = ALL_KINDS,
): PhiCheck {
  const checks: [PhiKind, () => boolean][] = [
    ["birth_date", () => hasBirthDate(text)],
    ["identifier", () => SSN.test(text) || SSN_WORDS.test(text) || MBI.test(text) || hasRecordId(text)],
    ["diagnosis", () => hasDiagnosis(text)],
    ["contact", () => hasForeignContact(text, allow)],
    ["address", () => hasClientAddress(text, allow)],
    ["client_name", () => hasClientName(text, allow)],
    ["identifying", () => sentences(text).some(indirectIdentifiers)],
  ];
  for (const [kind, found] of checks) if (only.includes(kind) && found()) return { ok: false, kind };
  return { ok: true };
}
