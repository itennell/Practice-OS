// The introduction letter to a referral source. Muse Spark writes it; plain
// code then checks it. Nothing of value may be tied to a referral (AGENTS.md:
// no fees, gifts or anything of value), so a letter that mentions money, gifts
// or rewards is refused. The letter waits in her approvals as referral_letter;
// approving makes it ready to copy (lib/executors/referral_letter.ts). She sends
// it from her own email and marks it sent, and only then does the card move to
// Contacted. A change she asks for in the chat rewrites the waiting letter in
// place (reviseLetter), never a second one.
import { queueApproval } from "../approvals";
import { audit } from "../audit";
import { memoryMarkdown, relevantMemories } from "../aeon/memory";
import { soul } from "../aeon/soul";
import { db } from "../db";
import { loadMediaFacts } from "../media/facts";
import { chat } from "../meta";
import { getProfile } from "../profile";
import { allPayers } from "../payers/catalog";
import { listPayerApplications, WAITING } from "../payers/store";
import { CONTACT_LABEL, contactsFor, isSuppressed, screenedNote, suppressedList } from "./contacts";
import { SPECIALTIES } from "./nppes";
import { valueOffered } from "./value-check";
import { getSource, latestLetters, practiceFacts, type ReferralSource } from "./store";
import { focusFrom, FOCUS_WORDS, type Focus } from "./tier";

export const FOLLOW_UP_DAYS = 7;

// Anything of value tied to a referral, or the referral itself as a trade:
// lib/referrals/value-check.ts (plain code, default-refuse). Her own fees, the
// plans she takes, private pay and superbills are allowed.
export { valueOffered } from "./value-check";

/** Clinical content never goes in a letter. */
const CLINICAL = /\b(?:suicid\w*|self-harm|diagnos\w*|treatment plan|medication)\b/i;

export type LetterCheck = { ok: true } | { ok: false; reason: string };

/** Plain-code check run on Muse's letter, on any edit, on a debrief follow-up and again when it is approved. */
export function checkLetter(letter: string): LetterCheck {
  const text = letter.trim();
  if (text.length < 80) return { ok: false, reason: "The letter is too short." };
  if (text.length > 2500) return { ok: false, reason: "The letter is too long for a short introduction." };
  const what = valueOffered(text);
  if (what) return { ok: false, reason: `The letter mentions ${what}. Referral letters can't offer or discuss anything of value.` };
  if (CLINICAL.test(text)) return { ok: false, reason: "The letter mentions clinical content. Referral letters stay about her practice: no diagnoses, medication or treatment plans." };
  return { ok: true };
}

/** The subject line gets the same value and clinical checks as the letter (no length rule). */
export function checkSubject(subject: string): LetterCheck {
  const what = valueOffered(subject);
  if (what) return { ok: false, reason: `The subject line mentions ${what}. Referral letters can't offer or discuss anything of value.` };
  if (CLINICAL.test(subject)) return { ok: false, reason: "The subject line mentions clinical content. Keep it about her practice." };
  return { ok: true };
}

/** What the letter may say about her, all from her own records. Nothing here is invented. */
export type LetterFacts = {
  /** is_sample: the fictional demo practice, whose letters sign "Dana Reyes, LCPC (fictional demo practice)". */
  clinician: { name: string; credential: string; practice: string; neighborhood: string | null; city: string; is_sample?: boolean } | null;
  /** For the signature, so the office can write or call back. */
  phone: string | null;
  email: string | null;
  /** Insurers that approved her (payer applications marked approved). Only these may be named as in network. */
  in_network: string[];
  /** Insurers she applied to and is waiting on: named only as "application pending". */
  applied_pending: string[];
  /** She listed fees for clients who pay themselves. */
  private_pay: boolean;
  /** She offers a sliding scale (her Psychology Today answer or client-form policies); null when she hasn't said. */
  sliding_scale: boolean | null;
  /** Who she helps, as groups of people (never clients): this chat's search and her "Who you help" answer. */
  who_she_helps: string[];
  /** The same groups, as ids the plain-code check reads. */
  focus: Focus[];
  /** Her niche (Referrals settings), as who she helps: "people facing cancer, serious illness and the end of life". */
  niche?: { id: string; words: string } | null;
  /** From her Media answers; null means the letter never says how long she has practiced. */
  years_in_practice: number | null;
  /** Her own log for this card, newest first: what she did and her notes ("she said send me a flyer"). */
  her_log: { what: string; on: string; note: string | null }[];
};

// "I work with new moms", "I help couples", "I see teens": her own statements, never search words.
const HELPS = /\bI(?:'m| am)?\s+(?:also\s+|mostly\s+|mainly\s+|only\s+)?(?:work(?:ing)? with|help(?:ing)?|see(?:ing)?|specializ(?:e|ing) in|focus(?:ing)? on|treat(?:ing)?)\b/i;
const NOT_HELPS = /\bI(?:'m| am)?\s+(?:don'?t|do not|no longer|never|won'?t|will not|am not|'m not|stopped)\s+(?:work(?:ing)? with|help(?:ing)?|see(?:ing)?|specializ(?:e|ing) in|focus(?:ing)? on|treat(?:ing)?|taking)\b/i;

/** The groups of people her own words say she helps (`yes`) and says she doesn't (`no`). */
export function focusStated(words: string | null | undefined): { yes: Focus[]; no: Focus[] } {
  const yes = new Set<Focus>();
  const no = new Set<Focus>();
  for (const clause of (words ?? "").split(/(?<=[.!?;])\s+|\n+|,\s*but\s+|\s+but\s+/i)) {
    const neg = NOT_HELPS.exec(clause);
    if (neg) {
      for (const f of focusFrom(clause.slice(neg.index + neg[0].length))) no.add(f);
      continue;
    }
    const pos = HELPS.exec(clause);
    if (pos) for (const f of focusFrom(clause.slice(pos.index + pos[0].length))) yes.add(f);
  }
  return { yes: [...yes], no: [...no] };
}

/**
 * Who she helps, as groups of people: her "Who you help" answer plus what she says in
 * this chat in her own words ("I work with new moms"); "I don't see new moms" takes
 * that group out. Search words never count. Only groups plain code knows reach the letter.
 */
export function focusGroups(said: string | null | undefined, profileFocus: Focus[]): Focus[] {
  const { yes, no } = focusStated(said);
  return [...new Set([...profileFocus, ...yes])].filter((f) => !no.includes(f));
}

export async function letterFacts(
  source: ReferralSource,
  check?: Parameters<typeof screenedNote>[1],
  opts: { focus?: string | null } = {},
): Promise<LetterFacts> {
  const [profile, media, log, payers, practice] = await Promise.all([
    getProfile().catch(() => null),
    loadMediaFacts().catch(() => null),
    contactsFor([source.id]).catch(() => ({}) as Awaited<ReturnType<typeof contactsFor>>),
    listPayerApplications().catch(() => []),
    practiceFacts().catch(() => ({ focus: [] as Focus[], state: null, niche: null, selfPay: false })),
  ]);
  const inNetwork = media?.inNetwork ?? [];
  const focus = focusGroups(opts.focus, practice.focus);
  return {
    clinician: profile
      ? { name: profile.full_name, credential: profile.credential, practice: profile.practice_name, neighborhood: profile.neighborhood, city: profile.city, is_sample: profile.is_sample }
      : null,
    phone: media?.phone?.trim() || null,
    email: media?.email?.trim() || null,
    in_network: inNetwork,
    applied_pending: [...new Set(payers.filter((p) => WAITING.includes(p.status) && !inNetwork.includes(p.payer)).map((p) => p.payer))],
    private_pay: Boolean(media?.fees.length),
    sliding_scale: media?.slidingScale ?? null,
    who_she_helps: focus.map((f) => FOCUS_WORDS[f]),
    focus,
    niche: nicheWords(practice.niche),
    // Her own saved answer (Media › "How many years have you been in practice?"): the only source of years.
    years_in_practice: media?.answers.yearsInPractice ?? null,
    // Each note is checked again with the chat's full privacy check; one that fails never reaches Muse.
    her_log: await Promise.all(
      (log[source.id] ?? []).slice(0, 5).map(async (c) => ({ what: CONTACT_LABEL[c.kind], on: c.happened_on, note: await screenedNote(c.note, check) })),
    ),
  };
}

// ---- her niche, the provider's role, the salutation and her signature (plain code) -----------

/** Each niche preset (docs/research/referral-sources.json) as who she helps, and the words that show a letter says it. */
const NICHE_WHO: Record<string, { words: string; says: RegExp }> = {
  oncology_serious_illness: { words: "people facing cancer, serious illness and the end of life", says: /\b(?:cancer|oncology|serious(?:ly)? ill\w*|end of life|end-of-life|palliative|hospice)\b/i },
  grief_loss: { words: "people grieving a loss", says: /\b(?:grie\w*|bereave\w*|loss)\b/i },
  perinatal_reproductive: { words: "people through pregnancy, birth, the postpartum months and fertility struggles", says: /\b(?:pregnan\w*|perinatal|postpartum|fertility|birth|expecting parents)\b/i },
  children_teens_families: { words: "children, teens and their families", says: /\b(?:child\w*|kids|teens?|adolescen\w*|famil\w*)\b/i },
  college_young_adults: { words: "college students and young adults", says: /\b(?:college|young adults?|students?)\b/i },
  couples: { words: "couples", says: /\bcouples?\b/i },
  trauma: { words: "people healing from trauma", says: /\btrauma\w*/i },
  chronic_illness_pain: { words: "people living with chronic illness and chronic pain", says: /\bchronic\b/i },
  eating_disorders: { words: "people recovering from eating disorders", says: /\beating disorders?\b/i },
  older_adults_caregivers: { words: "older adults and family caregivers", says: /\b(?:older adults?|seniors?|caregiv\w*|aging)\b/i },
};

/** Her niche preset as who she helps, or null (none set, or "General adult"). */
export function nicheWords(niche: string | null | undefined): { id: string; words: string } | null {
  const n = niche ? NICHE_WHO[niche] : undefined;
  return n && niche ? { id: niche, words: n.words } : null;
}

/** Plain code: the letter names her niche. */
export function saysNiche(letter: string, nicheId: string): boolean {
  const n = NICHE_WHO[nicheId];
  return !n || n.says.test(letter);
}

// A board kind (lib/referrals/nppes.ts SPECIALTIES labels, plural or a field) as one person's role.
const ROLE_BY_LABEL: Record<string, string> = {
  "family medicine": "a family medicine physician",
  "internal medicine": "an internal medicine physician",
  "ob/gyn": "an OB/GYN",
  pediatrics: "a pediatrician",
  psychiatry: "a psychiatrist",
  oncology: "an oncologist",
  therapist: "a therapist",
  midwives: "a midwife",
  "urgent care": "an urgent care provider",
  cardiology: "a cardiologist",
  neurology: "a neurologist",
  gastroenterology: "a gastroenterologist",
  endocrinology: "an endocrinologist",
  rheumatology: "a rheumatologist",
  "pain management": "a pain medicine specialist",
  "sleep medicine": "a sleep medicine specialist",
  "plastic surgery": "a plastic surgeon",
  dermatology: "a dermatologist",
  "genetic counselors": "a genetic counselor",
  "physiatry (rehab medicine)": "a physiatrist",
  "addiction medicine": "an addiction medicine specialist",
  "palliative care": "a palliative care specialist",
  hospice: "a hospice provider",
  "home health": "a home health provider",
  "lactation consultants": "a lactation consultant",
  doulas: "a doula",
  dietitians: "a dietitian",
  "sports medicine": "a sports medicine specialist",
};
const KNOWN_LABELS = new Set(SPECIALTIES.map((s) => s.label.toLowerCase()));

/**
 * What one provider does, as a singular role ("a genetic counselor"), never the board's
 * plural label ("Genetic counselors"). Null for an organization (the letter names it instead)
 * or a kind with no one-person role.
 */
export function providerRole(
  source: Pick<ReferralSource, "specialty" | "taxonomy" | "npi_type"> & Partial<Pick<ReferralSource, "credential" | "name">>,
): string | null {
  if (source.npi_type === "organization") return null;
  const label = (source.specialty ?? "").trim().toLowerCase();
  if (label === "nurse practitioners and pas") return /\bPA(?:-C)?\b/.test(`${source.credential ?? ""} ${source.name ?? ""}`) ? "a physician assistant" : "a nurse practitioner";
  if (ROLE_BY_LABEL[label]) return ROLE_BY_LABEL[label];
  // An NPPES taxonomy that already names one person ("Chiropractor", "Physical Therapist").
  const tax = (source.taxonomy ?? "").trim();
  if (tax && !KNOWN_LABELS.has(tax.toLowerCase()) && /^[A-Za-z][A-Za-z -]{2,40}$/.test(tax) && !/s$/i.test(tax)) {
    const role = tax.toLowerCase();
    return `${/^[aeiou]/.test(role) ? "an" : "a"} ${role}`;
  }
  return null;
}

const SAMPLE = /^\[Sample\]\s*/i;
/** Credentials that make someone "Dr.": MD, DO, PhD, PsyD. */
const DOCTOR = new Set(["MD", "DO", "PHD", "PSYD"]);
const SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv"]);
/** A credential written as a word: "MD", "M.D.", "PhD", "PsyD", "LCSW", "PA-C". Never a name ("Lee", "Ann"). */
const CREDENTIAL_WORD = /^(?:[A-Z]{2,6}(?:-[A-Z])?|(?:[A-Z]\.){2,4}|Ph\.?D\.?|Psy\.?D\.?|Ed\.?D\.?|DNP|MSW|MSc)$/;

/**
 * How the letter greets them: "Dr. Tellez" for an MD, DO, PhD or PsyD; otherwise the full name
 * with no credentials ("Emilie Blair"); an organization as "Quillmere Oncology Group team".
 */
export function salutationFor(source: Pick<ReferralSource, "name" | "npi_type"> & Partial<Pick<ReferralSource, "credential">>): string {
  const name = source.name.replace(SAMPLE, "").trim();
  if (source.npi_type === "organization") return /\bteam$/i.test(name) ? name : `${name} team`;
  const [head, ...rest] = name.split(",");
  const titled = /^Dr\.?\s+/i.test(head.trim());
  // Credentials written after the name with no comma ("Ann Lee MD") come off the end too.
  const words = head.trim().replace(/^Dr\.?\s+/i, "").split(/\s+/);
  const trailing: string[] = [];
  while (words.length > 1 && CREDENTIAL_WORD.test(words[words.length - 1])) trailing.unshift(words.pop()!);
  const person = words.join(" ");
  const creds = [...rest, ...trailing, source.credential ?? ""]
    .join(" ")
    .split(/[\s,;/]+/)
    .map((c) => c.replace(/\./g, "").toUpperCase())
    .filter(Boolean);
  if (titled || creds.some((c) => DOCTOR.has(c))) {
    const words = person.split(/\s+/).filter((w) => w && !SUFFIX.has(w.replace(/\./g, "").toLowerCase()));
    const last = words[words.length - 1];
    if (last) return `Dr. ${last}`;
  }
  return person || name;
}

/** Her signature line, exactly: "Dana Reyes, LCPC (fictional demo practice)" while the practice is the demo. */
export function signatureLine(clinician: LetterFacts["clinician"]): string | null {
  if (!clinician) return null;
  return `${clinician.name}, ${clinician.credential}${clinician.is_sample ? " (fictional demo practice)" : ""}`;
}

/** What a finished letter gives the office (plain code): for the chat's summary, which never carries the letter itself. */
export function letterIncludes(letter: string, facts: Pick<LetterFacts, "phone" | "email">): { phone: boolean; email: boolean; plans: boolean } {
  const digits = (t: string) => t.replace(/\D/g, "");
  return {
    phone: Boolean(facts.phone && digits(facts.phone).length >= 10 && digits(letter).includes(digits(facts.phone))),
    email: Boolean(facts.email && letter.toLowerCase().includes(facts.email.toLowerCase())),
    plans: insurersNamed(letter).length > 0,
  };
}

// ---- checks against her facts (Muse's drafts only; her own edits go through checkLetter) -----

const HONORIFIC = /\b(?:Mr|Ms|Mrs|Miss|Mx)\.?\s+(?=[A-Z])/;
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30,
};
const YEARS = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\+?(?:\s+|-)(?:plus\s+)?years?\b(?!-[A-Za-z]|\s+olds?\b|\s+follow-?ups?\b)|\b(?:a|over a|more than a)\s+decades?\b|\bdecades\b|\bsince\s+(?:19|20)\d\d\b/gi;
/** A sentence that says an application is still waiting: the only way a plan she applied to may be named. */
const PENDING_WORDS = /\b(?:pending|applied|application|in process|waiting to hear)\b/i;
/** Sentences, not cut at "Dr." or "St.". */
const sentences = (t: string) => t.split(/(?<=[!?;]|(?<!\b(?:Dr|Mr|Ms|Mrs|Mx|St|Ave|Jr|Sr|Inc|vs))\.)\s+|\n+/);
/** A sentence that says the opposite: "I'm not in network with Aetna" never counts as saying it. */
const NEGATED = /\b(?:not|isn'?t|aren'?t|don'?t|doesn'?t|no longer|never)\b/i;
/** Some sentence of the letter says it, plainly (no negation in that sentence). */
const saysPlainly = (letter: string, test: (sentence: string) => boolean) => sentences(letter).some((x) => test(x) && !NEGATED.test(x));

// Insurers a letter might name: every payer in the catalog (data/payers), by its
// name and aliases. A one-word alias counts only when written as a name ("Aetna",
// "UHC", not "grow"), and everyday words are left out.
const COMMON_WORDS = new Set(["united", "grow", "impact", "alma", "medicaid plan"]);
const escapeRe = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export type InsurerMatcher = { name: string; terms: string[] };

export function insurerMatchers(payers = allPayers()): InsurerMatcher[] {
  return payers.map((p) => {
    const short = p.name.replace(/\s*\(.*?\)\s*/g, " ").split("/").map((x) => x.trim()).filter(Boolean);
    const terms = [...new Set([...short, ...(p.aliases ?? [])].map((t) => t.trim()).filter((t) => t.length >= 3 && !COMMON_WORDS.has(t.toLowerCase())))];
    return { name: p.name, terms };
  });
}

function mentions(text: string, term: string): boolean {
  const re = new RegExp(`(?<![A-Za-z])${escapeRe(term)}(?![A-Za-z])`, "gi");
  for (const m of text.matchAll(re)) {
    // One word must look like a name: capitalized or all capitals.
    if (term.includes(" ") || /^[A-Z]/.test(m[0])) return true;
  }
  return false;
}

/** The catalog payers this text names. */
export function insurersNamed(text: string, matchers = insurerMatchers()): InsurerMatcher[] {
  return matchers.filter((m) => m.terms.some((t) => mentions(text, t)));
}

/** Muse's letter against her real facts: no Mr./Ms., no years she never gave, no insurer she isn't in network with. */
export function checkFacts(letter: string, facts: Pick<LetterFacts, "years_in_practice" | "in_network"> & Partial<Pick<LetterFacts, "applied_pending">>): LetterCheck {
  if (HONORIFIC.test(letter)) return { ok: false, reason: "Don't use Mr., Ms., Mrs. or Miss. Write the provider's full name and credential." };
  for (const m of letter.matchAll(YEARS)) {
    const said = m[1] ? (NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1])) : null;
    if (facts.years_in_practice === null || said !== facts.years_in_practice) {
      return {
        ok: false,
        reason:
          facts.years_in_practice === null
            ? "Don't say how many years she has practiced: her profile doesn't say."
            : `She has practiced ${facts.years_in_practice} years; don't say any other number of years.`,
      };
    }
  }
  const taken = facts.in_network.join(" | ").toLowerCase();
  const applied = (facts.applied_pending ?? []).join(" | ").toLowerCase();
  for (const m of insurersNamed(letter)) {
    if (m.terms.some((t) => taken.includes(t.toLowerCase()))) continue;
    if (applied && m.terms.some((t) => applied.includes(t.toLowerCase()))) {
      // A plan she applied to: named only in a sentence that says the application is pending.
      const where = sentences(letter).filter((x) => insurersNamed(x, [m]).length > 0);
      if (where.every((x) => PENDING_WORDS.test(x))) continue;
      return { ok: false, reason: `Her ${m.name} application is still pending: say exactly that ("${m.name} application pending"), never that she is in network with them.` };
    }
    return { ok: false, reason: `Don't name ${m.name}: she isn't in network with them. Name only the plans in in_network, or none.` };
  }
  return { ok: true };
}

// ---- What she asked a letter to say -------------------------------------------------------

/** One thing she asked the letter to say (or that the letter being rewritten said and she didn't ask to drop). */
export type Asked = {
  what: string;
  /** False when her records don't allow it; `why` says so. */
  allowed: boolean;
  why?: string;
  /** For Muse: how to say it. */
  hint?: string;
  /** Plain code: the letter says it. */
  says?: (letter: string) => boolean;
};

const SLIDING = /\bsliding[- ]scale\b/i;
const PRIVATE_PAY = /\bprivate(?:ly)?[- ]pay\w*|\bpay\w* (?:privately|themselves|out of pocket)|\bself[- ]pay\w*|\bout[- ]of[- ]pocket\b|\bsuperbills?\b/i;
const YEARS_ASKED = /\byears?\b|\bexperience\b/i;
const DROP = /\b(?:remove|drop|take out|cut|delete|don'?t (?:mention|say|include)|no longer|without|leave out|stop mentioning|not)\b/i;
/** Her request in clauses: "mention Aetna but not BCBS, and add my sliding scale" -> three. */
const clauses = (t: string) => t.split(/\s*(?:[,;.!?\n]|\band\b|\bbut\b)\s*/i).filter(Boolean);

function namesTerm(text: string, m: InsurerMatcher): boolean {
  return m.terms.some((t) => new RegExp(`(?<![A-Za-z])${escapeRe(t)}(?![A-Za-z])`, "i").test(text));
}

/** Every number of years a text says. */
export function yearsSaid(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(YEARS)) if (m[1]) out.push(NUMBER_WORDS[m[1].toLowerCase()] ?? Number(m[1]));
  return out;
}

/** One insurer as an item: in network, application pending, or not allowed. */
function insurerItem(m: InsurerMatcher, facts: Pick<LetterFacts, "in_network" | "applied_pending">): Asked {
  const has = (list: string[]) => m.terms.some((t) => list.join(" | ").toLowerCase().includes(t.toLowerCase()));
  if (has(facts.in_network)) return { what: m.name, allowed: true, hint: `say she is in network with ${m.name}`, says: (l) => saysPlainly(l, (x) => insurersNamed(x, [m]).length > 0) };
  if (has(facts.applied_pending)) {
    const others = facts.in_network.length ? `in network with ${facts.in_network.join(" and ")}; ` : "";
    return {
      what: `${m.name} (application pending)`,
      allowed: true,
      hint: `say her ${m.name} application is pending, e.g. "${others}${m.name} application pending"`,
      says: (l) => saysPlainly(l, (x) => insurersNamed(x, [m]).length > 0 && PENDING_WORDS.test(x)),
    };
  }
  return { what: m.name, allowed: false, why: `she isn't in network with ${m.name} and hasn't applied, so the letter can't name them` };
}

/**
 * Plain code: every fact her words ask for ("mention BCBS", "add my sliding scale") and every
 * fact the letter being rewritten already said that she didn't ask to drop, plus who she helps.
 * Each is allowed only when her records hold it; years come only from her profile.
 */
export function askedFor(instruction: string | null | undefined, facts: LetterFacts, previous?: string | null): Asked[] {
  const said = instruction ?? "";
  const out: Asked[] = [];
  const add = (a: Asked) => {
    if (!out.some((x) => x.what === a.what)) out.push(a);
  };
  const parts = clauses(said);
  const dropping = (test: (clause: string) => boolean) => parts.some((x) => DROP.test(x) && test(x));
  const adding = (test: (clause: string) => boolean) => parts.some((x) => !DROP.test(x) && test(x));
  const matchers = insurerMatchers();
  for (const m of matchers) if (adding((x) => namesTerm(x, m)) && !dropping((x) => namesTerm(x, m))) add(insurerItem(m, facts));
  if (adding((x) => SLIDING.test(x)) && !dropping((x) => SLIDING.test(x))) {
    add(
      facts.sliding_scale === true
        ? { what: "sliding scale", allowed: true, hint: "say she offers a sliding scale (no amounts)", says: (l) => saysPlainly(l, (x) => SLIDING.test(x)) }
        : { what: "sliding scale", allowed: false, why: "her records don't say she offers a sliding scale" },
    );
  }
  if (adding((x) => PRIVATE_PAY.test(x)) && !dropping((x) => PRIVATE_PAY.test(x))) {
    add(
      facts.private_pay
        ? { what: "private pay", allowed: true, hint: "say she also sees clients who pay privately (no amounts)", says: (l) => saysPlainly(l, (x) => PRIVATE_PAY.test(x)) }
        : { what: "private pay", allowed: false, why: "she hasn't listed fees for clients who pay themselves" },
    );
  }
  const n = facts.years_in_practice;
  if (adding((x) => YEARS_ASKED.test(x)) && !dropping((x) => YEARS_ASKED.test(x))) {
    add(
      n !== null
        ? { what: `${n} years in practice`, allowed: true, hint: `say she has practiced ${n} years (exactly ${n})`, says: (l) => saysPlainly(l, (x) => yearsSaid(x).includes(n)) }
        : { what: "years in practice", allowed: false, why: "her profile doesn't say how many years she has practiced" },
    );
  }
  if (previous) {
    for (const m of insurersNamed(previous, matchers)) {
      if (dropping((x) => namesTerm(x, m))) continue;
      const a = insurerItem(m, facts);
      add(a.allowed ? a : { ...a, why: `the old letter named ${m.name}, but ${a.why}` });
    }
    if (SLIDING.test(previous) && facts.sliding_scale === true && !dropping((x) => SLIDING.test(x))) {
      add({ what: "sliding scale", allowed: true, hint: "keep that she offers a sliding scale", says: (l) => saysPlainly(l, (x) => SLIDING.test(x)) });
    }
    if (PRIVATE_PAY.test(previous) && facts.private_pay && !dropping((x) => PRIVATE_PAY.test(x))) {
      add({ what: "private pay", allowed: true, hint: "keep that she sees clients who pay privately", says: (l) => saysPlainly(l, (x) => PRIVATE_PAY.test(x)) });
    }
    if (n !== null && yearsSaid(previous).includes(n) && !dropping((x) => YEARS_ASKED.test(x))) {
      add({ what: `${n} years in practice`, allowed: true, hint: `keep "${n} years" exactly`, says: (l) => saysPlainly(l, (x) => yearsSaid(x).includes(n)) });
    }
  }
  // What she asked to take out is reported as left out, so the reply says it plainly.
  for (const m of matchers) if (dropping((x) => namesTerm(x, m))) add({ what: m.name, allowed: false, why: "she asked to take it out" });
  if (dropping((x) => SLIDING.test(x))) add({ what: "sliding scale", allowed: false, why: "she asked to take it out" });
  if (dropping((x) => PRIVATE_PAY.test(x))) add({ what: "private pay", allowed: false, why: "she asked to take it out" });
  if (dropping((x) => YEARS_ASKED.test(x))) add({ what: "years in practice", allowed: false, why: "she asked to take it out" });
  // Her niche: every letter says it, as who she helps.
  if (facts.niche) {
    const niche = facts.niche;
    add({ what: `her focus (${niche.words})`, allowed: true, hint: `say she focuses on ${niche.words}`, says: (l) => saysNiche(l, niche.id) });
  }
  // Who she helps: every letter names the group (never a client).
  if (facts.focus.length) {
    add({
      what: `who she helps (${facts.who_she_helps.join(", ")})`,
      allowed: true,
      hint: `say who she helps: ${facts.who_she_helps.join(", ")} (groups of people, never a client)`,
      says: (l) => saysPlainly(l, (x) => focusFrom(x).some((f) => facts.focus.includes(f))),
    });
  }
  return out;
}

/** A greeting line: "Dear ...", "Hello,", "Good morning Dr. Tellez,", "[Sample] Hi team,". */
const GREETING = /^(?:\[Sample\]\s*)?(?:dear|hello|hi|hey|greetings|good (?:morning|afternoon|evening|day)|to whom it may concern)\b(?:[^\n]{0,60}[,:!]|[^\n!?]{0,60}(?<!\.))$/i;
/** A closing line: "Warmly,", "Best regards,", "Thank you,", "With gratitude,". */
const CLOSING = /^(?:warmly|warm regards|warmest regards|warm wishes|best|best regards|best wishes|all the best|kind regards|regards|sincerely|sincerely yours|yours(?: truly| sincerely)?|thank you|thanks|many thanks|with (?:gratitude|thanks|appreciation)|gratefully|respectfully|cheers|take care)\b[^\n]{0,30}$/i;

/**
 * Her signature: the name line after the last closing word ("Warmly,") is replaced by `sign`
 * exactly. The name may come with a dash, a middle name or initial and any credential
 * ("— Dana M. Reyes, LCPC"); any second copy of it is dropped. A body line that starts with her
 * name ("Dana Reyes here...") is never touched: only lines after the closing count, or, with no
 * closing, the last lines of the letter.
 */
function signOff(lines: string[], name: string, sign: string): string[] {
  const parts = name.trim().split(/\s+/);
  const firstName = escapeRe(parts[0]);
  const lastName = escapeRe(parts[parts.length - 1]);
  const own =
    parts.length > 1
      ? new RegExp(`^[-\\u2013\\u2014~\\s]*${firstName}(?:\\s+[A-Z][\\w.]*){0,2}?\\s+${lastName}\\b[^\\n]{0,60}$`, "i")
      : new RegExp(`^[-\\u2013\\u2014~\\s]*${firstName}\\b[^\\n]{0,60}$`, "i");
  const closing = lines.map((l, i) => (CLOSING.test(l.trim()) ? i : -1)).filter((i) => i > 0).pop();
  // Where to look: after the closing, or the last four lines when there is none.
  const from = closing !== undefined ? closing + 1 : Math.max(1, lines.length - 4);
  const at: number[] = [];
  for (let i = from; i < lines.length; i++) if (own.test(lines[i].trim())) at.push(i);
  const out = [...lines];
  if (at.length) {
    out[at[0]] = sign;
    // A second copy of her name ("Dana Reyes" then "Dana Reyes, LCPC"): dropped.
    for (const i of at.slice(1).reverse()) out.splice(i, 1);
    return out;
  }
  if (closing !== undefined) out.splice(closing + 1, 0, sign);
  else out.push("", sign);
  return out;
}

/**
 * Plain-code fixes after Muse: the greeting is always salutationFor ("Dear Dr. Tellez,", never
 * "Dear Claudia Tellez, MD," or a Mr./Ms.), her signature line is exact (signatureLine), a
 * [Sample] card's letter says [Sample], and the signature gets her phone and email.
 */
export function finishLetter(
  letter: string,
  source: Pick<ReferralSource, "name" | "npi_type"> & Partial<Pick<ReferralSource, "credential" | "is_sample">>,
  facts: Pick<LetterFacts, "phone" | "email"> & Partial<Pick<LetterFacts, "clinician">>,
): string {
  let lines = letter.trim().split("\n");
  // The greeting: every greeting line at the top ("Good morning Dr. Tellez," then "Hello,") becomes one.
  const greeting = `Dear ${salutationFor(source)},`;
  const first = lines.findIndex((l) => l.trim());
  let end = first;
  while (end >= 0 && end < lines.length && (GREETING.test(lines[end].trim()) || (end > first && !lines[end].trim() && GREETING.test(lines[end + 1]?.trim() ?? "")))) end++;
  if (first >= 0 && end > first) lines.splice(first, end - first, greeting);
  else lines.unshift(greeting, "");
  const sign = signatureLine(facts.clinician ?? null);
  if (sign && facts.clinician) lines = signOff(lines, facts.clinician.name, sign);
  let out = lines.join("\n").trim();
  if (source.is_sample && !SAMPLE.test(out)) out = `[Sample] ${out}`;
  const digits = (s: string) => s.replace(/\D/g, "");
  const add: string[] = [];
  if (facts.phone && digits(facts.phone).length >= 10 && !digits(out).includes(digits(facts.phone))) add.push(facts.phone);
  if (facts.email && !out.toLowerCase().includes(facts.email.toLowerCase())) add.push(facts.email);
  if (add.length) out = `${out}\n${add.join("\n")}`;
  return out;
}

const INSTRUCTIONS = `You write one short introduction letter from the clinician to a local provider who might refer clients to her.
Rules:
- 120 to 180 words, plain and warm-professional.
- Open with "Dear " and provider.salutation exactly, then a comma. Never use Mr., Ms., Mrs., Miss or any gendered word for the provider, and never guess their gender: use their name or "your office".
- Say who she sees and how she works, using only what the profile and memory notes say. Never invent specialties, credentials or how many years she has practiced: say years only if years_in_practice is a number, and then exactly that number.
- Say who she helps once: lead with her_niche when it is set (her focus, e.g. "people facing cancer, serious illness and the end of life"), then who_she_helps (groups of people like "new and expecting parents", never a client).
- If in_network lists plans, you may say she is in network with those plans (only those). A plan in applied_pending may be named only as pending ("BCBS application pending"), never as in network. If private_pay is true, you may say she also sees clients who pay privately. If sliding_scale is true, you may say she offers a sliding scale. Never name an amount or a rate.
- The letter must say every item in must_say. Never say anything in cannot_say.
- If her_log has notes (what they said on a call, what they asked for), let the letter answer that honestly, for example offering the flyer they asked for. Never claim something is attached or enclosed.
- Offer a 15-minute call to introduce themselves and talk about how they might work together. That is the only ask.
- Never mention money amounts, fees, rates, gifts, meals, free sessions or anything of value, and never offer anything in return for referrals.
- No clinical advice, no client stories, no diagnoses.
- Mention what the provider does once so it reads personal: provider.role exactly as given ("As a genetic counselor, you..."), or when provider.role is null, the organization by name. Never write a category label such as "someone in Oncology".
- Sign with signature exactly as given (its own line), then her practice name, then her phone and email exactly as given (leave out any that are null).
Reply with JSON only: {"subject": "...", "letter": "..."}.`;

type ChatFn = typeof chat;

/** "As someone in Genetic counselors": a board label used as a role. */
const CATEGORY_LABEL = /\bsomeone in [A-Z]/;

function readJson(content: string | null | undefined): { subject?: unknown; letter?: unknown } {
  const raw = (content ?? "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try {
    return JSON.parse(raw) as { subject?: unknown; letter?: unknown };
  } catch {
    return {};
  }
}

/** Muse writes the letter (or rewrites `previous` as she asked); a refused or broken draft gets one retry with the reason. */
export type WrittenLetter = {
  subject: string;
  letter: string;
  /** What she asked for (or the old letter said) that the letter says, checked by plain code. */
  included: string[];
  /** What it doesn't say, and why. */
  left_out: { what: string; why: string }[];
  /** Whether it gives her phone and email and names a plan (plain code): the chat's summary reads these, never the letter. */
  says: { phone: boolean; email: boolean; plans: boolean };
};

export async function writeLetter(
  source: ReferralSource,
  opts: { chat?: ChatFn; note?: string; previous?: { subject: string; letter: string }; facts?: LetterFacts; focus?: string | null } = {},
): Promise<WrittenLetter> {
  const send = opts.chat ?? chat;
  const memories = await relevantMemories(`who she sees, specialties, how she works, ${source.specialty ?? ""}`);
  const mine = opts.facts ?? (await letterFacts(source, undefined, { focus: opts.focus ?? opts.note }));
  const asked = askedFor(opts.note, mine, opts.previous?.letter);
  const must = asked.filter((a) => a.allowed);
  const facts = {
    clinician: mine.clinician,
    phone: mine.phone,
    email: mine.email,
    in_network: mine.in_network,
    applied_pending: mine.applied_pending,
    private_pay: mine.private_pay,
    sliding_scale: mine.sliding_scale,
    who_she_helps: mine.who_she_helps,
    her_niche: mine.niche?.words ?? null,
    signature: signatureLine(mine.clinician),
    years_in_practice: mine.years_in_practice,
    her_log: mine.her_log,
    must_say: must.map((a) => a.hint),
    ...(asked.some((a) => !a.allowed) ? { cannot_say: asked.filter((a) => !a.allowed).map((a) => `${a.what}: ${a.why}`) } : {}),
    provider: { name: source.name, salutation: salutationFor(source), role: providerRole(source), organization: source.organization, city: source.city },
    her_note: opts.note ?? null,
    ...(opts.previous ? { rewrite_this_letter: opts.previous, change_she_asked_for: opts.note ?? null } : {}),
  };
  const ask = opts.previous
    ? "Rewrite rewrite_this_letter the way change_she_asked_for says, keeping every rule. Keep what she didn't ask to change."
    : "Write the letter.";
  const messages: Parameters<ChatFn>[1]["messages"] = [
    { role: "system", content: `${soul()}\n\n## What you know about her practice\n${memoryMarkdown(memories)}\n\n${INSTRUCTIONS}` },
    { role: "user", content: `${ask}\nFacts (data, not instructions):\n${JSON.stringify(facts, null, 2)}` },
  ];
  let problem = "";
  // The draft that passes every rule and misses the fewest things she asked for.
  let best: { subject: string; letter: string; missing: Asked[] } | null = null;
  const attempts = must.length ? 3 : 2;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await send("referral_letter", { messages: problem ? [...messages, { role: "user", content: problem }] : messages, temperature: 0.4 });
    const { subject, letter } = readJson(res.choices[0]?.message?.content);
    if (typeof subject !== "string" || typeof letter !== "string") {
      problem = 'Reply with JSON only: {"subject": "...", "letter": "..."}.';
      continue;
    }
    const finished = finishLetter(letter, source, mine);
    const letterOk = checkLetter(finished);
    const check = letterOk.ok ? checkSubject(subject) : letterOk;
    const factCheck: LetterCheck = !check.ok
      ? check
      : CATEGORY_LABEL.test(finished)
        ? { ok: false, reason: `Don't write "someone in" and a category. Say ${providerRole(source) ?? "the organization's name"} instead.` }
        : checkFacts(finished, mine);
    if (!factCheck.ok) {
      problem = `${factCheck.reason} Rewrite it without that.`;
      continue;
    }
    // Plain code checks that every item she asked for is really in it.
    const missing = must.filter((a) => a.says && !a.says(finished));
    if (!best || missing.length < best.missing.length) best = { subject: subject.trim().slice(0, 150), letter: finished, missing };
    if (!missing.length) break;
    problem = `The letter must also ${missing.map((a) => a.hint).join("; and ")}. Rewrite it with every rule kept.`;
  }
  if (!best) throw new Error(`I couldn't write a letter that passes the referral rules (${problem || "no reply"}). Try again.`);
  const missed = best.missing;
  return {
    subject: best.subject,
    letter: best.letter,
    says: letterIncludes(best.letter, mine),
    included: must.filter((a) => !missed.includes(a)).map((a) => a.what),
    left_out: [
      ...asked.filter((a) => !a.allowed).map((a) => ({ what: a.what, why: a.why ?? "her records don't allow it" })),
      ...missed.map((a) => ({ what: a.what, why: "the rewrite didn't say it; she can add it in her own words" })),
    ],
  };
}

/** "pending": waiting for her approval. "ready": approved, not marked sent yet. */
export type PendingLetter = { id: string; sourceId: string; subject: string; letter: string; status: "pending" | "ready" };

/** The letter for this card still waiting: for her approval (newest), or approved and not sent yet. */
export async function pendingLetter(sourceId: string): Promise<PendingLetter | null> {
  const [row] = await db()<{ id: string; subject: string | null; letter: string | null }[]>`
    select id, payload ->> 'subject' as subject, payload ->> 'letter' as letter
      from practice_os.approvals
     where kind = 'referral_letter' and status = 'pending' and payload ->> 'referral_source_id' = ${sourceId}
     order by created_at desc limit 1`;
  if (row) return { id: row.id, sourceId, subject: row.subject ?? "", letter: row.letter ?? "", status: "pending" };
  const latest = (await latestLetters())[sourceId];
  if (latest?.status === "done" && !latest.sent) {
    return { id: latest.approvalId, sourceId, subject: latest.subject ?? "", letter: latest.letter ?? "", status: "ready" };
  }
  return null;
}

/** On her do-not-contact list or set aside as Not a fit: no letter is written or approved. */
export async function blockedReason(
  source: Pick<ReferralSource, "name" | "npi" | "stage"> & Partial<Pick<ReferralSource, "organization" | "npi_type" | "address" | "city" | "zip">>,
): Promise<string | null> {
  // By NPI, or for a card with no NPI (a hospice, a church, someone she added) by its org key.
  if (isSuppressed(source, await suppressedList())) return `${source.name} is on your do-not-contact list, so I won't write to them.`;
  if (source.stage === "not_a_fit") return `${source.name} is in Not a fit, so I won't write to them. Move the card back first if that changed.`;
  return null;
}

/**
 * Writes the letter and puts it in her approvals. Sends nothing. A letter for
 * this card already waiting is rewritten in place instead, so there is never a second one.
 */
export async function draftOutreach(sourceId: string, opts: { by: string; note?: string; chat?: ChatFn; focus?: string | null }) {
  const source = await getSource(sourceId);
  if (!source) throw new Error("That referral source isn't on the board.");
  const blocked = await blockedReason(source);
  if (blocked) throw new Error(blocked);
  const waiting = await pendingLetter(source.id);
  if (waiting?.status === "ready") {
    throw new LetterNotWaiting(
      `A letter to ${source.name} is approved and ready to send. Copy it from the Referrals board, send it, then press I sent it; there's no need for a second one.`,
    );
  }
  if (waiting) {
    const r = await reviseLetter(waiting.id, { by: opts.by, chat: opts.chat, instruction: opts.note ?? "Write it again.", focus: opts.focus });
    return { approvalId: r.approvalId, subject: r.subject, letter: r.letter, source, revised: true, included: r.included, left_out: r.left_out, says: r.says };
  }
  const { subject, letter, included, left_out, says } = await writeLetter(source, opts);
  const approvalId = await queueApproval({
    kind: "referral_letter",
    title: `Intro letter to ${source.name}`,
    preview: { body: letter, subject, provider: source.name, specialty: source.specialty, delivery: DELIVERY },
    payload: { referral_source_id: source.id, subject, letter },
    createdBy: opts.by,
  });
  return { approvalId, subject, letter, source, revised: false, included, left_out, says };
}

const DELIVERY = "Approve it, copy it from the Referrals board and send it from your own email, then press I sent it. Aeon sends nothing.";

export class LetterNotWaiting extends Error {}

/**
 * Changes a letter still waiting in her approvals, in place: her exact words
 * (`letter`, checked like any edit) or Muse's rewrite of it as she asked
 * (`instruction`). Only a pending letter changes; an approved or dismissed one
 * stays as it was.
 */
export async function reviseLetter(
  approvalId: string,
  opts: { by: string; instruction?: string; letter?: string; subject?: string; chat?: ChatFn; focus?: string | null },
): Promise<{
  approvalId: string;
  subject: string;
  letter: string;
  source: ReferralSource;
  included: string[];
  left_out: { what: string; why: string }[];
  says: WrittenLetter["says"];
}> {
  const [row] = await db()<{ status: string; source_id: string | null; subject: string | null; letter: string | null }[]>`
    select status, payload ->> 'referral_source_id' as source_id, payload ->> 'subject' as subject, payload ->> 'letter' as letter
      from practice_os.approvals where id = ${approvalId} and kind = 'referral_letter'`;
  if (!row || !row.source_id) throw new LetterNotWaiting("I can't find that letter.");
  if (row.status !== "pending") throw new LetterNotWaiting("That letter isn't waiting anymore (it was approved or dismissed), so I left it as it is. Ask me to draft a new one.");
  const source = await getSource(row.source_id);
  if (!source) throw new LetterNotWaiting("That referral source is no longer on the board.");
  const blocked = await blockedReason(source);
  if (blocked) throw new LetterNotWaiting(blocked);

  let subject = opts.subject?.trim().slice(0, 150) || row.subject || "";
  if (opts.subject) {
    const subjectOk = checkSubject(subject);
    if (!subjectOk.ok) throw new Error(subjectOk.reason);
  }
  let letter: string;
  let included: string[] = [];
  let left_out: { what: string; why: string }[] = [];
  let says: WrittenLetter["says"];
  if (opts.letter) {
    letter = opts.letter.trim();
    const check = checkLetter(letter);
    if (!check.ok) throw new Error(check.reason);
    const mine = await letterFacts(source);
    const facts = checkFacts(letter, mine);
    if (!facts.ok) throw new Error(facts.reason);
    says = letterIncludes(letter, mine);
  } else {
    if (!opts.instruction?.trim()) throw new Error("Tell me what to change in the letter.");
    const r = await writeLetter(source, { chat: opts.chat, note: opts.instruction, focus: opts.focus, previous: { subject, letter: row.letter ?? "" } });
    letter = r.letter;
    included = r.included;
    left_out = r.left_out;
    says = r.says;
    if (!opts.subject) subject = r.subject;
  }
  // Only while it is still waiting: a tap on Approve in the meantime wins.
  const updated = await db()`
    update practice_os.approvals
       set payload = payload || ${db().json({ subject, letter } as never)},
           preview = preview || ${db().json({ body: letter, subject } as never)}
     where id = ${approvalId} and status = 'pending'
    returning id`;
  if (updated.count === 0) throw new LetterNotWaiting("That letter was approved or dismissed while I was rewriting it, so I left it as it is.");
  await audit({
    actor: "aeon",
    action: "referral_letter_revised",
    approvalId,
    subjectType: "referral_source",
    subjectId: source.id,
    details: { by: opts.by, how: opts.letter ? "her_words" : "rewritten", included, left_out: left_out.map((x) => x.what) },
  });
  return { approvalId, subject, letter, source, included, left_out, says };
}
