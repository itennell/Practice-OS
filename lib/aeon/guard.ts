// The sensitive-info guard. One call at every point where text could reach the
// model or the database: her message, each tool result, each memory written and
// Aeon's reply. Layer 1 is plain-code rules (identity-filter.ts), layer 2 the
// local name-finder (phi-classifier.ts). Nothing is sent anywhere to be checked.
// It fails closed: if the name-finder can't load, the text is refused.
import { db } from "../db";
import {
  MY_CLIENT,
  checkIdentity,
  clientLike,
  clinicalForMemory,
  colleagueAt,
  foldTypos,
  medicalAboutSomeone,
  mentionsMedical,
  mentionsDiagnosis,
  namedCondition,
  ownContext,
  personalDetail,
  RELATIVES,
  referralContext,
  sentenceAt,
  sentenceSpans,
  type Allowlist,
  type PhiKind,
} from "./identity-filter";
import { findNames, isNameLike } from "./phi-classifier";

export type GuardPoint = "message" | "tool_result" | "memory" | "reply";
export type GuardKind = PhiKind | "unavailable" | "too_long" | "ambiguous_partner";
/** `question`: with ambiguous_partner, Aeon's question naming the cards ("Which Maria do you mean: ..."). */
export type GuardResult = { ok: true; text: string } | { ok: false; kind: GuardKind; question?: string };

/** The fixed line she sees when her message is refused. Never repeats what she typed. */
export const REFUSAL: Record<GuardKind, string> = {
  client_name:
    "That looks like a person's name, and I can't keep client details yet. If it's a colleague or referral source, add them on Referrals first. Otherwise, ask again without the name.",
  birth_date: "That looks like a birth date, and I can't keep client details yet. Ask again without it.",
  diagnosis: "That looks like a diagnosis about a person, and I can't keep clinical details. Ask again without it.",
  identifier: "That looks like an ID number (SSN, member or record number). I can't keep those. Ask again without it.",
  contact: "That looks like someone's email or phone number. I can't keep client contact details yet. Ask again without it.",
  address: "That looks like someone's home address. I can't keep client details yet. Ask again without it.",
  identifying:
    "That describes one client closely enough to pick them out (an age, a job, a place or a health detail). I can't keep client details yet. Ask again without those details.",
  unavailable: "My privacy check isn't working right now, so I can't read messages. Try again in a minute.",
  ambiguous_partner: "More than one card on your Referrals board has that name. Ask again with their full name, or pick the card on Referrals.",
  too_long: "That's too long for my privacy check to read in full, so I left its text out. Ask about a shorter part, or open it on the Files page.",
};

/** What a model sees in place of a tool result the rules refused. */
export const WITHHELD = "[withheld: this result may contain a client detail]";
const NAME_WITHHELD = "[name withheld]";
/** What stands in Aeon's reply for one line or card the guard left out. */
export const PART_LEFT_OUT = "[left out: this part may hold a client detail]";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, as-written match: never a piece of a longer word ("dr" in "address"). */
function wholeWord(name: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, `${flags}u`);
}

// Titles, credentials and sample labels are not part of a name when names are
// compared ("Dr. Carin Gordon, LCSW" is "carin gordon", "[Sample] Rev. Tobias
// Wren" is "tobias wren", "Brittany Keiser, MS, CGC" is "brittany keiser").
const TITLE_WORDS = new Set(
  (
    "dr doctor mr mrs ms mx miss prof professor rev reverend fr pastor chaplain md do phd psyd edd dnp lcsw licsw lsw msw lcpc lpc lpcc lmhc lmft mft " +
    "np fnp pmhnp aprn rn bsn msn pa-c cgc msgc ma cns bcc mdiv sample test"
  ).split(" "),
);

const wordsOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]s?$/u, "")
    .split(/[\s.,]+/)
    .map((w) => w.replace(/^[[(]+|[\])]+$/g, ""))
    .filter((w) => w && !TITLE_WORDS.has(w));

/** Every word of the name is in one entry ("Dana" in "Dana Reyes"). */
function partOf(words: string[], list: string[]): boolean {
  return words.length > 0 && list.some((n) => {
    const known = wordsOf(n);
    return words.every((w) => known.includes(w));
  });
}

/** The name is a whole entry, in any case ("Carin Gordon", "carin gordon"), never a piece of one. */
function wholeOf(words: string[], list: string[]): boolean {
  return list.some((n) => {
    const known = wordsOf(n);
    return known.length === words.length && known.every((w) => words.includes(w));
  });
}

const TITLE_BEFORE = /\b(?:Dr|Doctor)\.?\s+$/i;

const COMMANDS =
  "mark|move|log|draft|e-?mail|call|text|add|find|show|remove|archive|message|remind|schedule|send|write|open|update|edit|invite|ask|tell|contact|check|follow\\s+up\\s+with";
const COMMAND_AT_START = new RegExp(`^\\s*(?:please\\s+)?(?:${COMMANDS})\\b`, "i");
const COMMAND_BEFORE_NAME =
  /^(?:mark|move|log|draft|e-?mail|call|text|add|find|show|remove|archive|message|remind|schedule|send|write|open|update|edit|invite|ask|tell|contact|check|follow\s+up\s+with)\s+(.+)$/i;
const STAFF_AFTER =
  /^\s*(?:(?:at|from|on|in)\s+(?:the|their|our)\s+front\s+desk|,?\s*(?:their|the|our)\s+(?:office|practice|clinic)\s+manager|(?:in|from)\s+(?:their|the)\s+(?:billing|scheduling|referrals?|intake)\s+(?:office|team|department|desk))\b/i;
const STAFF_BEFORE =
  /\b(?:their|the)\s+(?:receptionist|scheduler|office\s+manager|practice\s+manager|front\s+desk(?:\s+person)?|referral\s+coordinator|intake\s+coordinator)\s*,?\s*$/i;

/** A first name introduced as a partner office's staff: "Jen at the front desk", "their office manager, Jen". */
function staffAt(text: string, at: number, name: string): boolean {
  return STAFF_AFTER.test(text.slice(at + name.length, at + name.length + 40)) || STAFF_BEFORE.test(text.slice(Math.max(0, at - 40), at));
}

export type PersonVerdict = { verdict: "ok" } | { verdict: "blank" } | { verdict: "refuse"; kind: PhiKind };

/**
 * How one name found in the text is treated, judged in the sentence around
 * EVERY place it appears. Default refuse: a name passes only when
 *  - it is her whole own name (profile or practice) and the sentence doesn't
 *    treat her like a client ("Dana Reyes wants Tuesdays after 5"), or a part of
 *    it ("Dana") in a sentence clearly about herself (I/my, her license, fees,
 *    hours, profile, posts);
 *  - it is a provider from her Referrals board in a referral sentence (card,
 *    letter, outreach, office, specialty, NPI): the whole name, or the surname
 *    with "Dr." ("Dr. Gordon's card status", "Gordon on my board");
 *  - she introduces a colleague with role and credential ("my supervisor Jenna
 *    Cho, LCSW") outside any client sentence.
 * A title or credential alone clears no one. "my client" next to any name refuses.
 * Anyone else is a stranger: refused when the sentence looks like a client's
 * (a visit, a bill, a condition), otherwise blanked where blanking is allowed.
 */
/**
 * `herWords`: the text is hers (her chat message, or a memory). Only there do the
 * business-only rules apply around a partner named by first name or surname (businessOnly,
 * PERSONAL_MATTER, the next sentence). Tool results and replies the code builds itself
 * ("Tue Aug 19, 9:00 am", "Maria Halvorsen, MS") are judged without them.
 */
export function judgePerson(name: string, text: string, allow: Allowlist, herWords = true): PersonVerdict {
  // "Mark Brittany Keiser as contacted": the name-finder can take the command
  // word as a first name. When the rest is a whole name on her list, judge that.
  const command = COMMAND_BEFORE_NAME.exec(name);
  if (command && wholeOf(wordsOf(command[1]), allow.names)) return judgePerson(command[1], text, allow, herWords);
  const words = wordsOf(name);
  // Only titles or a sample label ("Rev.", "[Sample]"): no one is named.
  if (words.length === 0) return { verdict: "ok" };
  const directory = allow.directory ?? [];
  const own = allow.names.filter((n) => !directory.includes(n));
  const ownWhole = wholeOf(words, own);
  const ownPart = partOf(words, own);
  const boardWhole = wholeOf(words, directory);
  const boardPart = partOf(words, directory);
  const spots = [...text.matchAll(wholeWord(name, "gi"))].map((m) => m.index ?? 0);
  let blank = false;
  for (const at of spots.length ? spots : [-1]) {
    const s = at < 0 ? text : sentenceAt(text, at);
    if (MY_CLIENT.test(s)) return { verdict: "refuse", kind: "client_name" };
    const condition = namedCondition(name, s);
    const clean = !clientLike(s, true) && !condition;
    if (clean && ownWhole) continue;
    if (clean && ownPart && ownContext(s)) continue;
    const titled = at >= 0 && TITLE_BEFORE.test(text.slice(Math.max(0, at - 8), at));
    // A command to her about a board name ("Text Brittany Keiser to confirm coffee") is referral work.
    const command = COMMAND_AT_START.test(s) && !clientLike(s);
    // A part of a board name ("Maria") never clears her own life details ("about her insurance
    // claim", "no-showed") or a next sentence leaning on it ("Plan lunch with Maria. Her son was arrested.").
    const partOnly = boardPart && !boardWhole;
    const after = at >= 0 && partOnly ? leaningNext(text, at) : null;
    const personal = herWords && partOnly && (PERSONAL_MATTER.test(s) || !businessOnly(s) || (after !== null && !partnerSentenceClean(after, name)));
    if (clean && !personal && (boardWhole || boardPart) && (referralContext(s) || command || (boardPart && titled))) continue;
    if (at >= 0 && colleagueAt(text, at, name) && !condition) continue;
    // A partner's staff by first name ("Jen at the front desk handles it"), outside any client sentence.
    // Never with a health word or diagnosis in the sentence ("Jen at the front desk is pregnant").
    if (at >= 0 && words.length === 1 && staffAt(text, at, name) && !condition && !clientLike(s) && !MY_CLIENT.test(s) && !mentionsDiagnosis(s) && !mentionsMedical(s)) continue;
    if (condition || clientLike(s)) return { verdict: "refuse", kind: mentionsDiagnosis(s) ? "diagnosis" : "client_name" };
    blank = true;
  }
  return blank ? { verdict: "blank" } : { verdict: "ok" };
}

/** A name that passes where it stands (see judgePerson). */
export function isAllowedPerson(name: string, text: string, allow: Allowlist, herWords = true): boolean {
  return judgePerson(name, text, allow, herWords).verdict === "ok";
}

// ---- partners named by first name or surname ------------------------------------
//
// "Set a meeting with Maria, Pamela and Birinder": she names her board partners the
// way she talks about them. Before the name-finder's names are judged, each one is
// resolved against the people on her board: a first name or surname (any case,
// titles and credentials out) that matches exactly ONE card is that partner. Two or
// more cards: Aeon asks which (at her message), never guesses. No card: judged as
// before (default refuse). A sentence that treats the name like a client's ("my
// client Maria", "Maria has stage 3 cancer", "Pamela's husband is in hospice",
// "Pamela's patient Kevin") is never resolved this way.

const ORG_WORD =
  /\b(?:cent(?:er|re)s?|clinics?|hospitals?|health|healthcare|medicine|medical|group|associates|services?|counseling|therapy|care|institute|foundation|practice|llc|pllc|inc|corp|network|society|church|university|college|school|family|families|partners|program|hospice|oncology|pharmacy|wellness|behavioral|psychology|psychiatry|department|office|cancer|support|community|alliance|house|home|ministries|clinic|system|systems|physicians|specialists|consulting|collective|studio|psychotherapy|rehabilitation|rehab)\b/i;

/** A board entry that reads as one person's name ("Maria Helgeson, MS"), not an organization's. */
export function looksLikePerson(name: string): boolean {
  const words = wordsOf(name);
  return words.length >= 2 && words.length <= 5 && !ORG_WORD.test(name.replace(/\[[^\]]*\]/g, " "));
}

/** The name as she'd say it: no sample label, title or credentials ("Dr. Maria Helgeson, MS" is "Maria Helgeson"). */
export function spokenName(name: string): string {
  const words = name
    .replace(/\[[^\]]*\]/g, " ")
    .split(",")[0]
    .split(/\s+/)
    .filter(Boolean);
  const bare = (w: string) => w.replace(/\./g, "").toLowerCase();
  while (words.length > 1 && TITLE_WORDS.has(bare(words[0]))) words.shift();
  while (words.length > 1 && TITLE_WORDS.has(bare(words.at(-1)!))) words.pop();
  const out = words.join(" ");
  // Stored in capitals ("PAMELA SERRANO VIDAL MD"): said the usual way.
  return /\p{Ll}/u.test(out) ? out : titleCase(out);
}

type Card = { name: string; words: string[] };

function partnerCards(allow: Allowlist): Card[] {
  const list = allow.partners ?? (allow.directory ?? []).filter(looksLikePerson);
  const seen = new Map<string, Card>();
  for (const name of list) {
    const words = wordsOf(name).filter((w) => w.length >= 2);
    const key = words.join(" ");
    if (words.length && !seen.has(key)) seen.set(key, { name, words });
  }
  return [...seen.values()];
}

/** The cards that have every one of these words. */
function cardsWith(words: string[], cards: Card[]): Card[] {
  return words.length ? cards.filter((c) => words.every((w) => c.words.includes(w))) : [];
}

type Token = { at: number; end: number; base: string; capital: boolean };

/** Words as written, a possessive "'s" left off ("Maria's" is "maria"). */
function tokensOf(text: string): Token[] {
  return [...text.matchAll(/\p{L}+(?:[-'’]\p{L}+)*/gu)].map((m) => {
    const raw = m[0].replace(/['’]s$/iu, "");
    return { at: m.index ?? 0, end: (m.index ?? 0) + raw.length, base: raw.toLowerCase(), capital: /^\p{Lu}/u.test(raw) };
  });
}

/** A sentence where a partner's name can't be resolved by a first name or surname: anything about a client or a health detail. */
// Her own life words about a person: what a client's sentence holds and a partner meeting never needs.
const PERSONAL_MATTER = new RegExp(
  `\\b(?:her|his|their)\\s+(?:[\\p{L}-]+\\s+)?(?:${RELATIVES}|claims?|insurance|leave|employer|boss|job|divorce|marriage|apartment|landlord|rent|court|case|lawyer|grief|loss|drinking|meds|medications?|prescriptions?|therapy|treatment|sessions?|appointments?|diagnosis|symptoms?|history)s?\\b|` +
    `\\b(?:claims?|denied|copays?|deductibles?|no-?show\\w*|intakes?|divorc\\w*|grie(?:f|ving|ves)|abus\\w*|arrest\\w*|drinks?|drinking|drunk|sober|relaps\\w*|foster|custody|evict\\w*|homeless|fired|laid\\s+off|lost\\s+(?:her|his|their)|cried|crying|tearful|died|passed\\s+away|funeral|zoloft|lexapro|prozac|xanax|adderall|wellbutrin|ssris?|meds|medications?|prescri\\w*|works?\\s+(?:at|for)|lives?\\s+(?:in|at|on|near)|retired)\\b|` +
    `\\b(?:is|was|turned|turns)\\s+\\d{1,3}\\b|,\\s*\\d{1,3}\\s*,|\\bmy\\s+(?:\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)|new\\s+intake|intake)\\b`,
  "iu",
);
/** The sentence after the one at `at` ("Plan lunch with Maria. Her son was arrested."): judged with it. */
function leaningNext(text: string, at: number): string | null {
  const spans = sentenceSpans(text);
  const span = spans.find(([s, e]) => at >= s && at < e);
  const next = span ? spans.find(([s]) => s >= span[1]) : undefined;
  return next ? text.slice(next[0], next[1]) : null;
}

// ---- what may stand next to a partner named by first name or surname: business only ----
//
// A POSITIVE list. Once a name was resolved from a first name or surname alone, the rest
// of its sentence (and the next one) may say only business things about that person:
// her/his/their + a business noun, she/he/they + a business clause, about/re:/regarding
// + a business noun, and no bare number. Anything else refuses (default refuse).

const BUSINESS_NOUN =
  "practice|practices|clinic|clinics|group|groups|office|offices|team|teams|staff|colleagues?|waitlist|wait\\s+list|caseload|referrals?|availability|" +
  "openings?|fees?|rates?|schedule|calendar|e-?mail|emails|number|phone|website|site|specialty|specialties|specialization|focus|niche|card|letters?|flyer|" +
  "brochures?|talk|lunch|coffee|meeting|meetings|call|intro|introduction|partnership|collaboration|workshop|event|events|program|programs|services|" +
  "front\\s+desk|desk|address|fax|hours|location|offices|department|unit|coordinator|manager|receptionist|scheduler|process|forms?|network|panel|panels|" +
  "insurance\\s+panels?|board|newsletter|presentation|training|book|podcast|blog|outreach|contact|info|information|details|new\\s+clients|openings|" +
  "IOP|PHP|lunch-and-learn|lunch-and-learns|associate|associates|brochure|fee\\s+sheet|NPI|sliding\\s+scale|EHR|conference|webinar";
const BUSINESS_NOUN_RE = new RegExp(`^(?:${BUSINESS_NOUN})$`, "i");
/** Words that may come before a business noun ("her new practice", "his clinic's waitlist", "their intake process"). */
const MODIFIER = /^(?:new|second|own|main|DBT|CBT|EMDR|ACT|teen|adolescent|adult|child|couples|family|parenting|grief|perinatal|trauma|skills|process|virtual|telehealth|evening|weekend|solo|other|current|private|group|intake|referral|front|clinic|practice|office|team|lunch|quick|short|palliative|oncology|hospice|genetic|counseling|care|cancer|support|weekly|monthly|next|last|first|upcoming|free)$/i;

/** One to three words, read as a business noun phrase ("clinic's waitlist", "palliative care referrals"). */
function businessPhrase(words: string[]): boolean {
  const ws = words.map((w) => w.replace(/['’]s$/i, "").toLowerCase());
  for (let i = 0; i < Math.min(ws.length, 3); i++) {
    if (BUSINESS_NOUN_RE.test(ws[i]) || (i + 1 < ws.length && BUSINESS_NOUN_RE.test(`${ws[i]} ${ws[i + 1]}`))) return true;
    if (!MODIFIER.test(ws[i])) return false;
  }
  return false;
}

const wordsAfter = (s: string, from: number, n = 4) =>
  s
    .slice(from)
    .split(/[^\p{L}'’-]+/u)
    .filter(Boolean)
    .slice(0, n);

const ARTICLE = /^(?:the|a|an|some|our|my|your|this|that|their|her|his)$/i;

// What she/he/they may do in a sentence about a partner: send or take referrals, have openings, run a group...
const BUSINESS_CLAUSE = new RegExp(
  "^(?:\\s+(?:said|says|mentioned|told\\s+me|thinks|thought)(?:\\s+that)?(?:\\s+(?:she|he|they))?)?\\s*" +
    "(?:['’](?:s|d|ll|re)\\s+|\\s+(?:is|are|was|were|will|would|can|could|might|may|should)\\s+(?:also\\s+|still\\s+|now\\s+)?)?(?:be\\s+)?" +
    "(?:send(?:s|ing)?|refer(?:s|ring)?|tak(?:e|es|ing)\\s+(?:new\\s+)?(?:clients|referrals|patients|insurance|[A-Z]\\w+)|accept(?:s|ing)?\\s+(?:new\\s+)?(?:clients|referrals|patients|insurance|[A-Z]\\w+)|" +
    "run(?:s|ning)?\\s+(?:a|an|the|her|his|their)\\s+|lead(?:s|ing)?\\s+(?:a|an|the)\\s+|host(?:s|ing)?\\s+(?:a|an|the)\\s+|" +
    "see(?:s|ing)?\\s+(?:adults|kids|children|teens|adolescents|families|couples|clients|patients|older\\s+adults)|" +
    "ha(?:s|ve)\\s+(?:a\\s+|an\\s+|some\\s+|no\\s+)?(?:openings?|availability|room|space|a\\s+waitlist|waitlist|slots?|time)|" +
    "offer(?:s|ing)?\\s+(?:a|an|the|free|group|lunch)|available|free\\s+(?:to|on|next|this)|open\\s+to\\s+(?:a|an|meeting|coffee|lunch|referrals|partnering)|" +
    "out\\s+of\\s+(?:the\\s+)?office|back\\s+(?:in|on|next)|in\\s+(?:the\\s+)?office|interested\\s+in\\s+(?:a|an|referrals|partnering|meeting|coffee|lunch)|" +
    "happy\\s+to\\s+(?:meet|refer|send|partner|chat|talk)|want(?:s|ed)?\\s+to\\s+(?:meet|refer|partner|collaborate|chat|talk|grab)|" +
    "work(?:s|ing)?\\s+(?:with|at)\\s+(?:the\\s+)?(?:[A-Z]\\w+|adults|kids|families|teens|couples|a\\s+(?:group|practice|clinic))|" +
    "reply|replied|respond(?:ed|s)?|wrote\\s+back|called\\s+back|emailed|got\\s+back|booked|confirm(?:ed|s)?|prefer(?:s|red)?\\s+(?:mornings|afternoons|zoom|email|coffee|lunch|a\\s+call)|" +
    "coordinat\\w*|manag(?:e|es|ing)\\s+(?:the|their|our)\\s+(?:referrals|intake|schedule|calendar)|handl(?:e|es|ing)\\s+(?:the|their)\\s+(?:referrals|intake|scheduling))\\b",
  "u",
);

// News about a partner's practice, read as a whole clause up to its end (a comma, a stop, "and
// she..."): the business phrase, then only time and place words ("next week", "in January", "to
// Evanston", "on Thursdays"). Anything else after it ("on vacation in rehab", "because of her
// breakdown") leaves the clause unread, so it refuses. A POSITIVE list, nothing else.
const MONTH = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const WEEKDAY = "Mondays?|Tuesdays?|Wednesdays?|Thursdays?|Fridays?|Saturdays?|Sundays?|weekends?|weekdays?|mornings?|afternoons?|evenings?";
const NOT_A_PLACE = "(?!(?:Rehab|Detox|Jail|Prison|Hospital|ICU|ER|Court|Treatment|Recovery)\\b)";
const PAYER = "BCBS|BCBSIL|Blue\\s+Cross(?:\\s+Blue\\s+Shield)?|Aetna|Cigna|United(?:healthcare)?|UHC|Medicaid|Medicare|Tricare|Humana|Optum|Magellan|Meridian|CountyCare|most\\s+insurance|insurance";
const FIELD =
  "perinatal|postpartum|anxiety|depression|grief|bereavement|trauma|oncology|cancer|cancer-related|adolescent|teen|child|couples|family|LGBTQ\\+?|queer|trans|" +
  "substance|substance-use|ADHD|OCD|eating|disorder|insurance|Medicaid|Medicare|older|adult|college|student|veteran|chronic|illness|hospice|palliative|end-of-life|new|self-pay";
const ASKED_FOR = "brochure|fee\\s+sheet|NPI|availability|card|business\\s+card|rates|fees|sliding\\s+scale|flyer|website|info|CV|bio|intake\\s+forms?";
const PRACTICE_NEWS_CLAUSE = [
  `(?:opened|opening|opens|moved|moving|moves|hiring|hires|hired|starting|started|starts|leaving|left|leaves|switching|switched|expanding|expanded|growing|closing|closed|relocating|relocated)\\s+(?:(?:her|his|their|a|an|the)\\s+)?(?:(?:new|second|third|own|group|private|solo|teen|adolescent|adult|family|couples|weekend|evening|virtual|telehealth|DBT|CBT)\\s+){0,2}(?:practice|group|office|program|clinic|location|IOP|PHP|waitlist)`,
  `(?:hiring|hires|hired|adding|added)\\s+(?:a|an|another|one|two)\\s+(?:new\\s+)?(?:associates?|therapists?|clinicians?|counselors?|interns?|billers?|receptionists?)`,
  `(?:switching|switched|moving|moved)\\s+to\\s+(?:an?\\s+)?(?:new\\s+)?(?:EHR|telehealth|[A-Z][\\w-]+)`,
  `on\\s+vacation`,
  `out\\s+of\\s+(?:the\\s+)?office`,
  `(?:out|away|off)(?=\\s+(?:until|through|till)\\b)`,
  `asked\\s+(?:for|about)\\s+my\\s+(?:${ASKED_FOR})(?:\\s*(?:,|and)\\s*(?:my\\s+)?(?:${ASKED_FOR}))*`,
  `(?:has|have|got|had)\\s+(?:some\\s+|a\\s+few\\s+|new\\s+|two\\s+|three\\s+)?(?:openings|availability|room|space|slots)`,
  `(?:takes|accepts|taking|accepting|take|accept)\\s+(?:${PAYER})`,
  `(?:presenting|presents|present|speaking|speaks|speak)\\s+at\\s+(?:the\\s+|a\\s+|an\\s+)?(?:(?:[A-Z][\\w-]*|counseling|therapy|clinical|regional|state|annual|national|local|spring|fall)\\s+){0,4}(?:conference|workshop|training|summit|meeting|event|grand\\s+rounds|webinar|lunch-and-learn)`,
  `(?:(?:wants?|wanted|plans?|planning|hopes?|hoping)\\s+to\\s+)?(?:co-?lead|co-?leads|co-?leading|lead|leads|leading|host|hosts|hosting|run|runs|running)\\s+(?:a|an|the)\\s+(?:new\\s+)?(?:workshop|training|webinar|lunch-and-learn|consultation\\s+group)`,
  `mentioned\\s+(?:a|an|the|her|his|their)\\s+(?:new\\s+)?(?:group|IOP|PHP|program|workshop|office|location|practice|associate|opening|training)`,
  `(?:said|says|mentioned)\\s+(?:that\\s+)?(?:her|his|their)\\s+(?:front\\s+desk|office|staff|team|scheduler|biller|receptionist|office\\s+manager)\\s+(?:lost|has|needs|got|never\\s+got|didn['’]t\\s+get|sent|missed|wants)\\s+my\\s+(?:fax|referral|letter|e-?mail|brochure|card|forms?|NPI|fee\\s+sheet)`,
  `(?:sees|gets|receives|see|get)\\s+(?:a\\s+lot\\s+of|lots\\s+of|many|mostly|plenty\\s+of)\\s+(?:(?:${FIELD})\\s+){1,3}referrals`,
].join("|");
const PRACTICE_NEWS_TAIL =
  `(?:\\s+(?:next|this|last)\\s+(?:week|month|year|weekend|spring|summer|fall|winter)|\\s+(?:in|on|until|through|till|by|from|after|before|starting)\\s+(?:the\\s+)?(?:${MONTH}|${WEEKDAY}|spring|summer|fall|winter|the\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}\\/\\d{1,2})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?|` +
  `\\s+(?:to|in)\\s+${NOT_A_PLACE}[A-Z][\\w-]+(?:\\s+${NOT_A_PLACE}[A-Z][\\w-]+){0,2}|\\s+on\\s+(?:${WEEKDAY}|Zoom)|\\s+(?:soon|again|too|now|already|this\\s+week))*`;
const PRACTICE_NEWS = new RegExp(
  `^(?:['’](?:s|d|ll|re|ve)\\b|\\s+(?:is|are|was|were|will|would|can|could|might|may|should))?(?:\\s+(?:just|also|recently|now|still|finally|really|soon))*\\s+(?:${PRACTICE_NEWS_CLAUSE})${PRACTICE_NEWS_TAIL}(?=[.!?]?\\s*$|,?\\s+and\\s+(?:she|he|they)\\b)`,
  "u",
);
// Field words name the referrals a partner sees, never a person's condition, only in this frame.
const SEES_REFERRALS = new RegExp(
  `\\b(?:she|he|they)\\s+(?:sees|gets|receives|see|get)\\s+(?:a\\s+lot\\s+of|lots\\s+of|many|mostly|plenty\\s+of)\\s+(?:(?:${FIELD})\\s+){1,3}referrals\\b(?=\\s*(?:[.,;!?]|$))`,
  "giu",
);
/** The sentence with a partner's "sees a lot of perinatal anxiety referrals" read as plain referral talk. */
export function withoutReferralFields(s: string): string {
  return s.replace(SEES_REFERRALS, (m) => m.split(/\s+/)[0] + " sends referrals");
}

/** True when everything said about a person in this sentence is practice business. */
export function businessOnly(s: string): boolean {
  if (/,\s*\d{1,3}\b/.test(s)) return false;
  for (const m of s.matchAll(/\b(?:her|his|their)\s+/giu)) {
    if (!businessPhrase(wordsAfter(s, (m.index ?? 0) + m[0].length))) return false;
  }
  // "Maria's Blue Cross claim", "Pamela's patient": a person's thing must be business too ("Dr. Serrano Vidal's team").
  for (const m of s.matchAll(/\b([\p{L}-]+)['’]s\s+/gu)) {
    const owner = m[1].toLowerCase();
    if (/^(?:she|he|it|that|what|there|here|who|let|where|how|today|tomorrow|week|month|year)$/.test(owner) || BUSINESS_NOUN_RE.test(owner)) continue;
    if (!businessPhrase(wordsAfter(s, (m.index ?? 0) + m[0].length))) return false;
  }
  for (const m of s.matchAll(/\b(?:she|he|they)\b/giu)) {
    const rest = s.slice((m.index ?? 0) + m[0].length);
    if (PRACTICE_NEWS.test(rest)) continue;
    const clause = BUSINESS_CLAUSE.exec(rest);
    if (!clause) return false;
    // A business clause ends the sentence, or hands over with ", and she/he/they" (judged on its
    // own above). Any other fragment after a comma or semicolon ("..., Mercy Hospital") refuses.
    const after = rest.slice(clause[0].length).split(/,?\s+and\s+(?=(?:she|he|they)\b)/i)[0];
    if (/[,;:]/.test(after)) return false;
  }
  for (const m of s.matchAll(/\b(?:about|regarding|re:?|to\s+discuss|discuss(?:ing)?|on\s+the)\s+/giu)) {
    const ws = wordsAfter(s, (m.index ?? 0) + m[0].length, 5);
    while (ws.length && ARTICLE.test(ws[0]) && !/^(?:her|his|their)$/i.test(ws[0])) ws.shift();
    // "about her/his ..." was judged above as a possessive.
    if (ws.length && /^(?:her|his|their)$/i.test(ws[0])) continue;
    if (!businessPhrase(ws)) return false;
  }
  return true;
}

function partnerSentenceClean(sentence: string, said: string, herWords = true): boolean {
  const who = escape(said);
  const s = withoutReferralFields(sentence);
  return (
    !MY_CLIENT.test(s) &&
    !/\b(?:client|patient)\b/i.test(s) &&
    !clientLike(s) &&
    !mentionsDiagnosis(s) &&
    !mentionsMedical(s) &&
    !medicalAboutSomeone(s) &&
    (!herWords || (!PERSONAL_MATTER.test(s) && businessOnly(s))) &&
    !namedCondition(said, s) &&
    !new RegExp(`(?<![\\p{L}\\p{N}])${who}['’]s\\s+(?:[\\p{L}-]+\\s+)?(?:${RELATIVES})s?\\b`, "iu").test(s)
  );
}

export type PartnerMatch =
  /** Every part of the name is one partner each ("Maria, Pamela" read as one name: two partners). */
  | { kind: "partners"; cards: string[] }
  /** A part of it matches two or more cards: ask which. */
  | { kind: "ambiguous"; said: string; choices: string[] }
  /** Not (only) her partners, or a sentence that treats it like a client's: judge it the usual way. */
  | { kind: "none" };

/**
 * One name the name-finder found, resolved against the people on her board. The
 * name is found again in the text word by word (the name-finder can merge a list,
 * "Maria, Pamela", or cut a word short, "Biri"). Words written next to each other
 * are one person and must all be on one card ("Maria Smith" is not Maria Helgeson);
 * words split by a comma, "and" or a colon are separate people.
 */
export function partnerMatch(name: string, text: string, allow: Allowlist, herWords = true): PartnerMatch {
  const cards = partnerCards(allow);
  if (!cards.length) return { kind: "none" };
  const said = name
    .split(/[\s,]+/)
    .map((w) => w.replace(/['’]s$/iu, "").toLowerCase())
    .filter((w) => w && !TITLE_WORDS.has(w.replace(/\./g, "")));
  if (!said.length) return { kind: "none" };
  const tokens = tokensOf(text);
  const hits: Token[][] = [];
  for (let i = 0; i + said.length <= tokens.length; i++) {
    const run = tokens.slice(i, i + said.length);
    // Each word as found, or (the last one) cut short by the name-finder.
    const fits = run.every((t, k) => t.base === said[k] || (k === said.length - 1 && said[k].length >= 3 && t.base.startsWith(said[k])));
    if (fits) hits.push(run);
  }
  if (!hits.length) return { kind: "none" };
  const found: string[] = [];
  let ambiguous: { said: string; choices: string[] } | null = null;
  for (const run of hits) {
    // A title or credential written just before ("Dr. Marwah") stays part of the person, not of the name.
    const groups: Token[][] = [];
    for (const t of run) {
      const last = groups.at(-1);
      if (last && /^[ \t]+$/.test(text.slice(last.at(-1)!.end, t.at))) last.push(t);
      else groups.push([t]);
    }
    for (const group of groups) {
      // A command or day word the name-finder took into the name ("Email Halvorsen" in a capitalized copy) is not part of it.
      const onCard = (w: string) => cards.some((c) => c.words.includes(w));
      const words = group.map((t) => t.base).filter((w) => !TITLE_WORDS.has(w) && (onCard(w) || !COMMON_AFTER_NAME.test(w)));
      if (!words.length) continue;
      // The word right after, written as part of the same name ("Maria Smith"), must be on the card too.
      const next = tokens.find((t) => t.at >= group.at(-1)!.end);
      const before = [...tokens].reverse().find((t) => t.end <= group[0].at);
      const joined = [before, next].filter(
        (t): t is Token =>
          Boolean(t) && t!.capital && !TITLE_WORDS.has(t!.base) && /^[ \t]+$/.test(text.slice(Math.min(t!.end, group.at(-1)!.end), Math.max(t!.at, group[0].at))),
      );
      const all = [...words, ...joined.filter((t) => cards.some((c) => c.words.includes(t.base))).map((t) => t.base)];
      if (joined.some((t) => !cards.some((c) => c.words.includes(t.base)) && !COMMON_AFTER_NAME.test(t.base))) return { kind: "none" };
      const spoken = text.slice(group[0].at, group.at(-1)!.end);
      const sent = sentenceAt(text, group[0].at);
      if (!partnerSentenceClean(sent, spoken, herWords)) return { kind: "none" };
      const after = leaningNext(text, group[0].at);
      if (herWords && after && !partnerSentenceClean(after, spoken)) return { kind: "none" };
      // The positive gate stays: a referral sentence, a command to her, or "Dr." before the name.
      // A first name never clears a sentence just because it lacks client words.
      const titledHere = TITLE_BEFORE.test(text.slice(Math.max(0, group[0].at - 8), group[0].at));
      if (!(referralContext(sent) || (COMMAND_AT_START.test(sent) && !clientLike(sent)) || titledHere)) return { kind: "none" };
      const match = cardsWith(all, cards);
      if (match.length === 0) return { kind: "none" };
      if (match.length === 1) found.push(match[0].name);
      else ambiguous ??= { said: spoken, choices: match.map((c) => spokenName(c.name)) };
    }
  }
  if (ambiguous) return { kind: "ambiguous", ...ambiguous };
  return found.length ? { kind: "partners", cards: [...new Set(found)] } : { kind: "none" };
}

// Capitalized words that may follow or lead a name without being part of it ("Call Birinder Thursday").
const COMMON_AFTER_NAME =
  /^(?:mark|move|log|draft|email|e-mail|call|text|add|find|show|remove|archive|message|remind|schedule|send|write|open|update|edit|invite|ask|tell|contact|check|follow|set|plan|book|please|hi|hey|thanks|meet|coffee|lunch|today|tomorrow|tonight|next|this|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|morning|afternoon|evening|week|i|and|or|with|at|on|to|for)$/i;

/** Her question when a first name or surname is on two or more cards. */
export function whichPartner(said: string, choices: string[]): string {
  const list = choices.slice(0, 4);
  const names = list.length > 1 ? `${list.slice(0, -1).join(", ")} or ${list.at(-1)}` : list[0];
  return `Which ${titleCase(said)} do you mean: ${names}? Ask again with their full name, or pick the card on Referrals.`;
}

/**
 * Blanks each name as a whole word. A one-word name is blanked only where it is
 * capitalized, so "Grace" never takes "grace period" with it; a full name
 * ("Kevin Ortiz") is blanked in any case.
 */
export function blankNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names) {
    const oneWord = !/\s/.test(n.trim());
    out = out.replace(wholeWord(n, "gi"), (m) => (oneWord && !/^\p{Lu}/u.test(m) ? m : NAME_WITHHELD));
  }
  return out;
}

/** Every word capitalized the usual way, same length, so "KEVIN ORTIZ" and "kevin ortiz" read as names. */
export function titleCase(text: string): string {
  return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => {
    const first = w[0].toUpperCase();
    const rest = w.slice(1).toLowerCase();
    return first.length === 1 && rest.length === w.length - 1 ? first + rest : w;
  });
}

// Tool results are the practice's own records and official sources: board phone
// numbers, renewal dates from years ago, rule text that names a disorder. Every
// tool result gets the ID and "client <name>" rules plus personalDetail (birth
// dates, emails, home addresses, a condition someone has); names are judged
// below. Tools that return free text she or a client wrote get every rule (fullRules).
const TOOL_RESULT_RULES: readonly PhiKind[] = ["identifier", "client_name"];

// Look-alike letters from other scripts inside a Latin word ("Кevin" with a
// Cyrillic К) are read as the Latin letter. A word wholly in another script
// ("Иван") stays as it is, for the non-Latin name rule.
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h", ӏ: "l",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
  ο: "o", ν: "v", ι: "i", κ: "k", ρ: "p", τ: "t", υ: "u", χ: "x",
};
const LOOKALIKE_CHARS = new RegExp(`[${Object.keys(LOOKALIKE).join("")}]`, "gu");

function foldLookalikes(text: string): string {
  return text.replace(/[\p{L}]+/gu, (w) => (/\p{Script=Latin}/u.test(w) ? w.replace(LOOKALIKE_CHARS, (c) => LOOKALIKE[c] ?? c) : w));
}

// "K e v i n  O r t i z": four or more single letters with single spaces read as one word,
// split again where a capital follows a small letter ("KevinOrtiz" is "Kevin Ortiz").
function joinSpacedLetters(text: string): string {
  return text.replace(/(?<!\p{L})\p{L}(?:[ \t]+\p{L}(?!\p{L})){3,}/gu, (m) => m.replace(/[ \t]+/g, "").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"));
}

/**
 * The text both layers read: look-alike letters folded (NFKC: fullwidth "Ｋｅｖｉｎ"
 * is "Kevin"; Cyrillic "Кevin" is "Kevin"), accents and stray combining marks
 * dropped, invisible characters (zero-width spaces, joiners, direction marks)
 * removed, and spaced-out letters joined, so none of them can split or hide a
 * name. Used for checking only; what is saved is unchanged.
 */
export function normalizeForCheck(text: string): string {
  return foldTypos(joinSpacedLetters(foldLookalikes(text.replace(UUID_ANYWHERE, "[id]").normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").normalize("NFKC"))));
}

// Digits and symbols written for letters ("cl1ent S4rah K1ein", "p@tient",
// "k!ll"). "1" and "|" can be i or l, so there are two readings. Only inside a
// word with at least two letters, never a plain number, a time or an ordinal
// ("4pm", "1st", "90837"): those are checked as written.
const LEET: Record<string, [string, string]> = {
  "1": ["i", "l"], "|": ["i", "l"], "!": ["i", "i"], "4": ["a", "a"], "@": ["a", "a"],
  "3": ["e", "e"], "0": ["o", "o"], "5": ["s", "s"], $: ["s", "s"], "7": ["t", "t"],
};
const LEET_CHAR = /[\p{L}013457@$!|]/u;
const LEET_TOKEN = /[\p{L}013457@$!|]+/gu;
const NUMBER_WITH_UNIT = /^\d+(?:st|nd|rd|th|am|pm|s|k|x|yo|mg|ml|mi|hrs?|min|mins|f|m)$/i;

function foldLeetWith(text: string, pick: 0 | 1): string {
  return text.replace(LEET_TOKEN, (t) => {
    if ((t.match(/\p{L}/gu)?.length ?? 0) < 2 || NUMBER_WITH_UNIT.test(t)) return t;
    const chars = [...t];
    return chars
      .map((c, i) => {
        const swap = LEET[c];
        if (!swap) return c;
        const before = i > 0 && LEET_CHAR.test(chars[i - 1]);
        const after = i + 1 < chars.length && LEET_CHAR.test(chars[i + 1]);
        // Inside a word ("S4rah", "k!ll"), or starting one before a letter ("$arah", "5arah").
        return after && (before || /\p{L}/u.test(chars[i + 1])) ? swap[pick] : c;
      })
      .join("");
  });
}

/** The leet readings of text already cleaned by normalizeForCheck that differ from it. */
export function leetVariants(plain: string): string[] {
  const out = new Set<string>();
  for (const pick of [0, 1] as const) {
    const v = foldTypos(foldLeetWith(plain, pick));
    if (v !== plain) out.add(v);
  }
  return [...out];
}

export type GuardOptions = {
  /** A tool result holding free text (notes, memories, approval previews, documents): every rule applies. */
  fullRules?: boolean;
  /**
   * Text too long for the name-finder's second read in full (a long upload) is
   * refused as too_long instead of passing on the first read alone. Set for
   * uploads and free-text tool results.
   */
  failClosedWhenLong?: boolean;
  /**
   * Her chat message (lib/aeon/agent.ts): a first name or surname on two or more board
   * cards comes back as ambiguous_partner with a question naming them. Elsewhere such a
   * name is judged the usual way.
   */
  askWhichPartner?: boolean;
};

export async function guard(text: string, at: GuardPoint, allow?: Allowlist, opts: GuardOptions = {}): Promise<GuardResult> {
  // The allowlist is cleaned the same way, so an allowed "José García" matches "Jose Garcia".
  const raw = allow ?? (await practiceAllowlist());
  const list: Allowlist = {
    names: raw.names.map(normalizeForCheck),
    contacts: raw.contacts.map(normalizeForCheck),
    ...(raw.directory ? { directory: raw.directory.map(normalizeForCheck) } : {}),
    ...(raw.places ? { places: raw.places.map(normalizeForCheck) } : {}),
    ...(raw.partners ? { partners: raw.partners.map(normalizeForCheck) } : {}),
  };
  const whole = await checkWithVariants(text, at, list, opts);
  if (whole.ok || at !== "reply" || whole.kind === "unavailable" || whole.kind === "too_long") return whole;
  // One card or line shouldn't blank Aeon's whole answer: leave out only the parts
  // that are refused on their own. Anything less clear-cut refuses the whole reply.
  return (await withoutRefusedParts(text, list, opts)) ?? whole;
}

/** The text as written, then each leet reading of it ("cl1ent S4rah K1ein"). */
async function checkWithVariants(text: string, at: GuardPoint, list: Allowlist, opts: GuardOptions): Promise<GuardResult> {
  const first = await checkOnce(text, at, list, opts);
  if (!first.ok) return first;
  // Public directory and rule text (a light tool result) is read as written.
  if (at === "tool_result" && !opts.fullRules) return first;
  for (const variant of leetVariants(normalizeForCheck(text))) {
    const r = await checkOnce(variant, at, list, opts);
    if (!r.ok) return r;
    // A name that only shows up when the digits are read as letters can't be
    // blanked where it stands, so it is refused.
    if (r.text !== variant) return { ok: false, kind: "client_name" };
  }
  return first;
}

/**
 * Aeon's reply split into lines or cards (or sentences when it is one
 * paragraph). The parts the guard refuses on their own are replaced with
 * PART_LEFT_OUT, and the rest is checked again as a whole. Null (refuse the
 * whole reply) when no single part is at fault, when more than half would go,
 * or when what is left still fails.
 */
const PERSON_HINT = /\b(?:she|he|her|hers|his|him|they|them|client|patient|caller)\b/i;
const NO_SUBJECT =
  /^(?:and|but|also|or|plus|started|starting|finished|has|had|is|was|were|got|went|just|recently|lives|living|works|working|wants|needs|who|which|whose|diagnosed|turned|turns)\b/i;

function leansOnNeighbour(part: string): boolean {
  const body = part.replace(/^\s*(?:(?:[-*•]|\d+[.)])\s+)?/, "");
  return PERSON_HINT.test(body) || NO_SUBJECT.test(body) || /^\p{Ll}/u.test(body) || mentionsMedical(body) || mentionsDiagnosis(body);
}

async function withoutRefusedParts(text: string, list: Allowlist, opts: GuardOptions): Promise<GuardResult | null> {
  const isContent = (p: string) => p.trim() !== "";
  let parts = text.split(/(\n+)/);
  if (parts.filter(isContent).length < 2) parts = sentenceSpans(text).map(([s, e]) => text.slice(s, e));
  const content = parts.filter(isContent);
  if (content.length < 2) return null;
  const checked: (string | null)[] = [];
  for (const p of parts) {
    if (!isContent(p)) {
      checked.push(p);
      continue;
    }
    const r = await checkWithVariants(p, "reply", list, opts);
    if (r.ok) {
      checked.push(r.text);
      continue;
    }
    // A health detail or a client pinned down by details is spread over the
    // sentences around it ("Your client is 61. She lives in ... She has ..."):
    // never kept in part.
    if (r.kind === "unavailable" || r.kind === "too_long" || r.kind === "diagnosis" || r.kind === "identifying") return null;
    checked.push(null);
  }
  // A part next to one left out goes too when it leans on it: a person word
  // ("she", "the client"), no subject of its own ("Started chemo last week"),
  // or a health word.
  const contentAt = parts.map((p, i) => (isContent(p) ? i : -1)).filter((i) => i >= 0);
  const out = new Set(contentAt.filter((i) => checked[i] === null));
  for (const i of [...out]) {
    const k = contentAt.indexOf(i);
    for (const j of [contentAt[k - 1], contentAt[k + 1]]) {
      if (j !== undefined && !out.has(j) && leansOnNeighbour(parts[j])) out.add(j);
    }
  }
  if (out.size === 0 || out.size * 2 > content.length) return null;
  const dropped = [...out].map((i) => parts[i]);
  const kept = parts.map((p, i) => {
    if (!out.has(i)) return checked[i] ?? p;
    // Keep the list marker and spacing, so a numbered plan still reads as one.
    const lead = /^\s*(?:(?:[-*•]|\d+[.)])\s+)?/.exec(p)?.[0] ?? "";
    const trail = /\s*$/.exec(p)?.[0] ?? "";
    return `${lead}${PART_LEFT_OUT}${trail}`;
  });
  const rest = kept.join("");
  // A person named in a part that was left out is tied to a client detail there,
  // so their name anywhere else in the reply says too much: hold it all back.
  try {
    const restPlain = normalizeForCheck(rest);
    for (const p of dropped) {
      const plain = normalizeForCheck(p);
      const found = [...(await findNames(plain)), ...(await findNames(titleCase(plain), { secondReads: false }))];
      for (const n of found.filter(isNameLike)) {
        if (wordsOf(n).some((w) => w.length > 1 && wholeWord(w, "i").test(restPlain))) return null;
      }
    }
  } catch {
    return null;
  }
  const again = await checkWithVariants(rest, "reply", list, opts);
  return again.ok ? again : null;
}

/** Joins a line break that splits a sentence: the line before doesn't end one, and the next isn't a list item. */
function joinBrokenLines(text: string): string {
  return text.replace(/([^.!?:;\s])[ \t]*\n+[ \t]*(?!(?:[-*•]|\d+[.)])\s)/g, "$1 ");
}

// A UUID (an approval or card id the code puts in a tool result) is never a phone or record
// number, but its hex digits ("...-e18592619355") read as a phone about 1 time in 200: the
// checks read "[id]" in its place (normalizeForCheck).
const UUID_ANYWHERE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

async function checkOnce(text: string, at: GuardPoint, list: Allowlist, opts: GuardOptions): Promise<GuardResult> {
  const plain = normalizeForCheck(text);
  const light = at === "tool_result" && !opts.fullRules;
  // Her own words (her message, a memory) get the business-only rules around a partner's first name.
  const herWords = at === "message" || at === "memory";
  const rules = light ? checkIdentity(plain, list, TOOL_RESULT_RULES) : checkIdentity(plain, list);
  if (!rules.ok) return { ok: false, kind: rules.kind };
  const detail = light ? personalDetail(plain, list) : null;
  if (detail) return { ok: false, kind: detail };
  // Memory holds practice-business facts only: no clinical content, even with no name.
  if (at === "memory" && clinicalForMemory(plain, list.places)) return { ok: false, kind: "diagnosis" };
  // A line break can split one sentence ("My client has\nPTSD"), so the rules
  // also read a copy with every line joined; names are also judged in a copy
  // where only lines broken mid-sentence are joined (a list stays a list).
  const joined = light ? plain : joinBrokenLines(plain);
  if (!light) {
    // List markers go too, so "My client has\n1. PTSD" reads as one sentence.
    const flat = plain.replace(/[ \t]*\n+[ \t]*(?:(?:[-*•]|\d+[.)])\s+)?/g, " ");
    if (flat !== plain) {
      const again = checkIdentity(flat, list);
      if (!again.ok) return { ok: false, kind: again.kind };
      if (at === "memory" && clinicalForMemory(flat, list.places)) return { ok: false, kind: "diagnosis" };
    }
  }

  let names: string[];
  let cased: string[];
  const titled = titleCase(plain);
  try {
    names = await findNames(plain, { failWhenCapped: opts.failClosedWhenLong || opts.fullRules });
    // A second, cheaper read with every word capitalized: names written in
    // capitals or lowercase ("KEVIN ORTIZ", "carin gordon") are found too.
    cased = titled === plain || titled.length !== plain.length ? [] : await findNames(titled, { secondReads: false });
    // One name read across a sentence end ("coffee with Maria. Maria's PTSD is worse" gives
    // "Maria. Maria"): each side is judged on its own, at every place it appears.
    const split = (list: string[]) => list.flatMap((n) => n.split(/(?<!\b(?:Dr|Doctor|Mr|Mrs|Ms|Mx|Prof|Rev|Fr|St|\p{Lu}))[.!?]+\s+/u).map((p) => p.trim()).filter(Boolean));
    names = split(names);
    cased = split(cased);
  } catch (err) {
    if (err instanceof Error && err.name === "TooLongToCheck") return { ok: false, kind: "too_long" };
    console.error(`[guard] name-finder unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, kind: "unavailable" };
  }
  // A partner's first name or surname written in lowercase, which the name-finder can miss
  // ("maria no-showed again"), in a sentence about someone's own life or visits: refused.
  if (herWords) {
    const cards = partnerCards(list);
    for (const t of tokensOf(plain)) {
      if (t.capital || !cards.some((c) => c.words.includes(t.base))) continue;
      const s = sentenceAt(plain, t.at);
      if (MY_CLIENT.test(s) || clientLike(s) || PERSONAL_MATTER.test(s) || !businessOnly(s)) return { ok: false, kind: "client_name" };
    }
  }
  const strangers: string[] = [];
  // Her partners named by first name or surname (partnerMatch): one card each passes;
  // a name on two or more cards is asked about at her message, judged as before elsewhere.
  let ambiguous: { said: string; choices: string[] } | null = null;
  const asPartner = (n: string): boolean => {
    const p = partnerMatch(n, plain, list, herWords);
    if (p.kind === "partners") return true;
    if (p.kind === "ambiguous" && at === "message" && opts.askWhichPartner) {
      ambiguous ??= { said: p.said, choices: p.choices };
      return true;
    }
    return false;
  };
  for (const n of names.filter(isNameLike)) {
    if (asPartner(n)) continue;
    const v = judgePerson(n, plain, list, herWords);
    if (v.verdict === "refuse") return { ok: false, kind: v.kind };
    const w = joined === plain ? v : judgePerson(n, joined, list, herWords);
    if (w.verdict === "refuse") return { ok: false, kind: w.kind };
    if (v.verdict === "blank" || w.verdict === "blank") strangers.push(n);
  }
  // A name found only in the capitalized copy is judged as written, the same
  // way. A one-word hit there ("hope", "will") is often an everyday word, so it
  // counts only when its sentence looks like a client's.
  for (const n of cased.filter(isNameLike)) {
    for (const m of titled.matchAll(wholeWord(n, "g"))) {
      const asWritten = plain.slice(m.index ?? 0, (m.index ?? 0) + n.length);
      if (asWritten === n) continue;
      // "Dr. Tellez treats" read as one name in the capitalized copy: when the
      // capitalized words are her own or a board name, that name was judged above.
      const capital = asWritten.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w));
      if (capital.length > 0 && capital.length < asWritten.split(/\s+/).length && partOf(wordsOf(capital.join(" ")), list.names)) continue;
      if (asPartner(asWritten)) continue;
      const v = judgePerson(asWritten, plain, list, herWords);
      if (v.verdict === "refuse") return { ok: false, kind: v.kind };
      if (v.verdict === "blank" && /\s/.test(n.trim())) strangers.push(asWritten);
    }
  }
  if (strangers.length === 0) {
    const which = ambiguous as { said: string; choices: string[] } | null;
    return which ? { ok: false, kind: "ambiguous_partner", question: whichPartner(which.said, which.choices) } : { ok: true, text };
  }
  // A tool result or Aeon's own reply keeps its content with the names blanked
  // out, so one word misread as a name doesn't throw away a whole answer.
  // Anything she typed or Aeon would save is refused outright.
  if (at !== "tool_result" && at !== "reply") return { ok: false, kind: "client_name" };
  const redacted = blankNames(text, strangers);
  // Names are found in the cleaned copy but blanked in the original, so a copy
  // written differently ("Kévin", hidden characters) can survive. Check again:
  // if any stranger is still there, withhold the whole result.
  try {
    const again = normalizeForCheck(redacted);
    if ((await findNames(again)).some((n) => isNameLike(n) && !isAllowedPerson(n, again, list, herWords))) return { ok: false, kind: "client_name" };
  } catch {
    return { ok: false, kind: "unavailable" };
  }
  return { ok: true, text: redacted };
}

// ---- the practice's own names and contacts -----------------------------------

let cached: { at: number; list: Allowlist } | null = null;
const CACHE_MS = 60_000;

/** Call after changing names on the list (a Referrals search), so the next check sees them. */
export function forgetAllowlist(): void {
  cached = null;
}

/** From her profile, her credentialing identity and location, and her Referrals list. */
export async function practiceAllowlist(): Promise<Allowlist> {
  if (!process.env.DATABASE_URL) return { names: [], contacts: [] };
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
  const sql = db();
  const [profile] = await sql<{ full_name: string; practice_name: string; city: string | null; neighborhood: string | null }[]>`
    select full_name, practice_name, city, neighborhood from practice_os.clinician_profile limit 1`;
  const [cred] = await sql<{ identity: Record<string, string>; practice_location: Record<string, unknown> }[]>`
    select identity, practice_location from practice_os.credentialing_profile limit 1`.catch(() => []);
  const sources = await sql<
    { name: string; organization: string | null; npi_type: string | null; email: string | null; phone: string | null; address: string | null }[]
  >`select name, organization, npi_type, email, phone, address from practice_os.referral_sources`;

  const location = (cred?.practice_location ?? {}) as { name?: string; phone?: string; address?: { street?: string } };
  const names: (string | null | undefined)[] = [
    profile?.full_name, profile?.practice_name, cred?.identity?.name, cred?.identity?.practiceName, location.name,
    ...sources.flatMap((s) => [s.name, s.organization]),
  ];
  const contacts: (string | null | undefined)[] = [
    cred?.identity?.email, cred?.identity?.phone, location.phone, location.address?.street,
    ...sources.flatMap((s) => [s.email, s.phone, s.address]),
  ];
  const present = (v: string | null | undefined): v is string => Boolean(v);
  const directory = sources.flatMap((s) => [s.name, s.organization]).filter(present);
  const places = [profile?.city, profile?.neighborhood].filter(present);
  // The people on her board (NPPES individuals, or a card that reads as a person's name), so
  // "Maria" alone can be resolved to the one Maria on it. Every card counts, do-not-contact,
  // Not a fit and sensitive ones too: their tools refuse them in plain words, not the privacy check.
  const partners = sources
    .filter((s) => s.npi_type === "individual" || (s.npi_type !== "organization" && looksLikePerson(s.name)))
    .map((s) => s.name);
  cached = { at: Date.now(), list: { names: names.filter(present), contacts: contacts.filter(present), directory, places, partners } };
  return cached.list;
}
