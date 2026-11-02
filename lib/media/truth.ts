// The practice facts every piece of Media copy must agree with (posts, captions,
// slides, reels, Psychology Today boxes, website pages), and the plain-code
// checks and repairs run after Muse writes. Facts come from lib/media/facts.ts
// (loadMediaFacts) at generation time, never from a cache or a constant here, so a
// fee or insurer she changes in chat reaches the very next draft.
//
// factProblems() finds claims her saved details contradict ("we don't take
// insurance" while she's on a panel, a plan she isn't with, a superbill schedule
// she never set, a language or school she didn't give). repairCopy() fixes what
// plain code can fix safely (the fee-label template, superbill cadence, filler
// phrases, "we" for a solo practice) and leaves the rest to the critic.
import type { MediaFacts } from "./facts";

export type TruthFacts = {
  fees: { label: string; cents: number }[];
  /** Plans she's in network with or applying to: the only ones copy may name. */
  insurers: string[];
  /** Plans that approved her: only these are "in network". */
  inNetwork: string[];
  /** 0 = no free consult. */
  freeConsultMinutes: number;
  /** She answered the free consult question (0 can also mean "not asked yet"). */
  consultKnown: boolean;
  telehealth: boolean;
  /** "Lincoln Park, Chicago". */
  place: string;
  /** Languages besides English, in her words ("" = none given). */
  languages: string;
  /** School and degree lines she gave. */
  education: string[];
  /** A solo practice writes as "I", never "we". */
  solo: boolean;
};

export function truthOf(f: MediaFacts): TruthFacts {
  return {
    fees: f.fees,
    insurers: f.insurers,
    inNetwork: f.inNetwork,
    freeConsultMinutes: f.answers.freeConsultMinutes,
    consultKnown: f.answers.freeConsultMinutes > 0 || f.pt.seen.includes("freeConsultMinutes"),
    telehealth: f.telehealth,
    place: [f.neighborhood, f.city].filter(Boolean).join(", "),
    languages: f.answers.languages,
    education: f.education,
    solo: true,
  };
}

// Payer names to look for. Any of these she isn't with is blocked. Names that are
// also everyday words (Grow, Alma, Horizon, Empire, Devoted...) are left out here;
// "in network with ..." catches any payer by name.
export const INSURERS = [
  "aetna", "cigna", "evernorth", "blue cross", "blue shield", "bcbs", "bcbsil", "anthem", "elevance", "unitedhealthcare",
  "united healthcare", "uhc", "optum", "umr", "humana", "magellan", "oscar", "tricare", "triwest", "medicare", "medicaid",
  "meridian", "ambetter", "carelon", "kaiser", "molina", "centene", "wellcare", "countycare", "health alliance", "harvard pilgrim",
  "highmark", "premera", "regence", "multiplan", "first health", "cofinity", "lyra", "spring health", "headway", "compsych",
  "health net", "geha", "meritain", "lucet", "new directions", "valueoptions", "cigna behavioral",
];

/** Other names for the same plan, so "BCBS" counts as her Blue Cross Blue Shield. */
const ALIASES: [RegExp, string[]][] = [
  [/blue cross|blue shield|bcbs/, ["blue cross", "blue shield", "bcbs", "bcbsil"]],
  [/united ?healthcare|uhc/, ["unitedhealthcare", "united healthcare", "uhc"]],
  [/cigna/, ["cigna", "evernorth", "cigna behavioral"]],
  [/anthem|elevance/, ["anthem", "elevance"]],
];

/** Her plan names, lower case, with their other names. */
export function hersLower(insurers: string[]): string {
  const base = insurers.map((p) => p.toLowerCase());
  const extra = ALIASES.flatMap(([re, names]) => (base.some((b) => re.test(b)) ? names : []));
  return [...base, ...extra].join(" | ");
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);

/** One fee as a sentence fragment a caption can use as is: "$200 for a first session (intake)". */
export function feeText(fee: { label: string; cents: number }): string {
  const bare = fee.label.replace(/^\d{5}\s+/, "").trim();
  // "Psychotherapy, 38-52 min" reads as "a psychotherapy session (38-52 min)".
  const parts = bare.match(/^([^,]+),\s*(.+)$/);
  const label = parts ? `${parts[1]}${/session|visit|intake|consult/i.test(parts[1]) ? "" : " session"} (${parts[2]})` : bare;
  const lower = /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
  return `${money(fee.cents)} for ${/^(a|an|the|each|one)\b/i.test(lower) ? "" : /^[aeiou]/i.test(lower) ? "an " : "a "}${lower}`;
}

/** What insurance and superbills really are for her, in one plain sentence. */
export function insuranceLine(t: TruthFacts): string {
  if (t.inNetwork.length) return `In network with ${list(t.inNetwork)}. For other plans, a superbill on request.`;
  return "Not in network with any plan yet (out of network). Clients can ask for a superbill to send to their insurer.";
}

/** The fact sheet for a generation prompt. Facts only: nothing here may be changed or added to. */
export function factSheet(t: TruthFacts): string[] {
  return [
    `- Prices (the only ones that exist): ${t.fees.length ? t.fees.map(feeText).join("; ") : "none listed: do not mention any price"}. Write a price inside a sentence ("A first session is $200."), never as "Label: $200" after a verb.`,
    `- Insurance: ${insuranceLine(t)} ${t.inNetwork.length ? "Never say she is private pay, out of network only, or doesn't take insurance." : "Never say she is in network or takes insurance."} Name no other plan.${t.insurers.length > t.inNetwork.length ? ` Applying to ${list(t.insurers.filter((x) => !t.inNetwork.includes(x)))}: not in network yet.` : ""}`,
    "- Superbills: given on request. Never say how often (monthly, weekly, after each session) or that they are automatic.",
    `- Free consult: ${t.freeConsultMinutes ? `a free ${t.freeConsultMinutes}-minute call` : t.consultKnown ? "none: do not offer one" : "not set: say 'book a consult' without a length or price"}.`,
    `- Where: in person in ${t.place || "her office"}${t.telehealth ? ", and by video" : ""}.`,
    `- Languages: ${t.languages ? `English and ${t.languages}` : "not given: never mention languages"}.`,
  ];
}

// ---- checks ------------------------------------------------------------------------------

export type FactKind = "insurer" | "insurance_claim" | "superbill" | "consult" | "language" | "education";
export type FactProblem = { kind: FactKind; message: string };

const NO_INSURANCE = [
  /\bprivate[- ]pay\b/i,
  /\bself[- ]pay only\b/i,
  /\bcash[- ]only\b/i,
  /\b(?:don'?t|do not|doesn'?t|does not|can'?t|cannot|won'?t|will not)\s+(?:take|accept|bill|work with|file (?:with|to)|submit (?:claims )?to)\s+(?:any\s+)?(?:health\s+)?insurance\b/i,
  /\bnot in[- ]network with any\b/i,
  /\b(?:out[- ]of[- ]network only|only out[- ]of[- ]network)\b/i,
  /\bno insurance (?:is )?(?:accepted|taken)\b/i,
  /\binsurance (?:is )?not accepted\b/i,
  /\b(?:i'?m|i am|we'?re|we are) (?:an? )?out[- ]of[- ]network(?! (?:for|with|on)\b)/i,
];
const TAKES_INSURANCE = [/\b(?:i'?m|i am|we'?re|we are) in[- ]network\b/i, /\b(?:i|we) (?:take|accept|bill) (?:\w+ )?insurance\b/i, /\binsurance (?:is )?accepted\b/i];

const CADENCE = [
  /\bsuperbills?\b[^.!?\n]{0,60}?\b(?:each|every|per|once a) (?:month|week|session|visit)\b/i,
  /\b(?:each|every|once a) (?:month|week)\b[^.!?\n]{0,40}?\bsuperbills?\b/i,
  /\b(?:monthly|weekly|automatic(?:ally)?)\s+superbills?\b/i,
  /\bsuperbills?\b[^.!?\n]{0,40}?\b(?:monthly|weekly|automatically)\b/i,
];

const LANGS = [
  "Spanish", "Polish", "Mandarin", "Cantonese", "Chinese", "Arabic", "French", "Korean", "Hindi", "Urdu", "Tagalog", "Vietnamese",
  "Russian", "Portuguese", "German", "Italian", "ASL", "American Sign Language", "Ukrainian", "Gujarati", "Japanese", "Hebrew",
  "Greek", "Farsi", "Persian", "Haitian Creole", "Bengali", "Punjabi", "Swahili", "Somali", "Amharic", "Yiddish", "Turkish",
];
const ENGLISH_ONLY = /\b(?:english only|only (?:in )?english|(?:i|we) (?:only )?speak english|english[- ]speaking only)\b/i;

const SCHOOL = /\b(?:University of [A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*|(?:[A-Z][A-Za-z.&'-]+ )+(?:University|College|Institute|Seminary))\b/g;
const SCHOOL_FILLER = new Set(["university", "college", "institute", "seminary", "of", "the", "state", "school"]);

/** Claims in the text her saved details contradict or don't hold. */
export function factProblems(text: string, t: TruthFacts): FactProblem[] {
  const out: FactProblem[] = [];
  const clean = text.replace(/[’‘]/g, "'");
  const lower = clean.toLowerCase();
  const hers = hersLower(t.insurers);
  for (const name of INSURERS) {
    if (new RegExp(`\\b${name}\\b`).test(lower) && !hers.includes(name))
      out.push({ kind: "insurer", message: `names ${name.replace(/\b\w/g, (c) => c.toUpperCase())}, which isn't one of your plans` });
  }
  for (const m of clean.matchAll(/\bin[- ]network with ([^.;:!?\n]+)/gi)) {
    for (const part of m[1].split(/,\s*|\s+and\s+|\s+or\s+/i).map((x) => x.trim().toLowerCase()).filter(Boolean)) {
      if (!t.inNetwork.some((p) => p.toLowerCase().includes(part) || part.includes(p.toLowerCase())) && !hersLower(t.inNetwork).includes(part))
        out.push({ kind: "insurance_claim", message: `says you're in network with ${part}, which hasn't approved you` });
    }
  }
  if (t.inNetwork.length && NO_INSURANCE.some((p) => p.test(clean)))
    out.push({ kind: "insurance_claim", message: `says you don't take insurance, but you're in network with ${list(t.inNetwork)}` });
  if (!t.inNetwork.length && TAKES_INSURANCE.some((p) => p.test(clean)))
    out.push({ kind: "insurance_claim", message: "says you take insurance, but no plan has approved you yet" });
  if (CADENCE.some((p) => p.test(clean))) out.push({ kind: "superbill", message: "says when superbills go out; you give them on request" });
  // Only once she answered: 0 can also mean she hasn't been asked yet.
  if (t.consultKnown && /\bfree\b[^.]{0,30}\b(?:consult\w*|call|phone call|session)\b/i.test(clean) && !t.freeConsultMinutes) out.push({ kind: "consult", message: "offers a free consult you don't offer" });
  for (const m of clean.matchAll(/\b(\d{2})[- ]minute\b[^.]{0,20}\b(?:consult\w*|call)\b/gi)) {
    if (t.consultKnown && Number(m[1]) !== t.freeConsultMinutes) out.push({ kind: "consult", message: `offers a ${m[1]}-minute consult` });
  }
  const langs = t.languages.toLowerCase();
  for (const l of LANGS) {
    if (new RegExp(`\\b${l}\\b`).test(clean) && !langs.includes(l.toLowerCase())) out.push({ kind: "language", message: `mentions ${l}, a language you didn't give` });
  }
  if (!t.languages && ENGLISH_ONLY.test(clean)) out.push({ kind: "language", message: "says which languages you speak, which you didn't say" });
  const school = t.education.join(" ").toLowerCase();
  for (const m of clean.matchAll(SCHOOL)) {
    const words = m[0].toLowerCase().split(/\s+/).filter((w) => !SCHOOL_FILLER.has(w));
    if (!words.length || !words.every((w) => school.includes(w))) out.push({ kind: "education", message: `names ${m[0]}, which isn't the school you gave` });
  }
  return dedupe(out);
}

function dedupe(xs: FactProblem[]): FactProblem[] {
  const seen = new Set<string>();
  return xs.filter((x) => (seen.has(x.message) ? false : (seen.add(x.message), true)));
}

// ---- filler, voice and placeholders ---------------------------------------------------------

/** Phrases that made default copy read 5/10: repeated, corporate, empty. */
export const FILLER: RegExp[] = [
  /\bno pressure\b/i,
  /\bhappy to help\b/i,
  /\b(?:we|i) look forward\b/i,
  /\blook forward to (?:hearing|meeting|working|seeing)\b/i,
  /\bdo(?:n'?t| not) hesitate\b/i,
  /\bfeel free to\b/i,
  /\breach out today\b/i,
  /\b(?:we'?re|we are|i'?m|i am) here for you\b/i,
  /\byour (?:healing |wellness )?journey\b/i,
  /\btake the first step\b/i,
  /\brest assured\b/i,
  /\bwe can'?t wait\b/i,
];

export function fillerHits(text: string): string[] {
  return FILLER.flatMap((p) => text.match(p)?.[0] ?? []);
}

/** Sentences Aeon wrote to her, not to clients: demo notes, placeholders, "I left this blank". */
export const PLACEHOLDER: RegExp[] = [
  /\[(?:fill in|placeholder|insert|tbd|your )[^\]]*\]/i,
  /\b(?:this|the) (?:draft|profile|box|text|post|page)\b[^.!?]{0,40}\b(?:demo|sample|placeholder|example)\b/i,
  /\bdemo (?:practice|profile|info|information|data|account)\b/i,
  /\bfor (?:this|the) demo\b/i,
  /\bas a sample\b/i,
  /\bI (?:left|kept)\b[^.!?]{0,60}\b(?:blank|empty|out|for now)\b/i,
  /\b(?:placeholder|lorem ipsum|TBD)\b/i,
  /\b(?:you can|you'?ll want to|be sure to|remember to) (?:edit|change|replace|update|fill in|add) (?:this|these|the|your)\b/i,
  /^\s*note:/i,
];

/** Splits Aeon's notes to her out of paste-ready text. */
export function splitPlaceholders(text: string): { text: string; notes: string[] } {
  const notes: string[] = [];
  const kept = sentences(text).filter((s) => {
    if (PLACEHOLDER.some((p) => p.test(s))) {
      notes.push(s.trim());
      return false;
    }
    return true;
  });
  return { text: kept.join(" ").replace(/\s+/g, " ").trim(), notes };
}

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

/** Casual words in her answers that read wrong in a profile or post. */
export const CASUAL = /\b(?:[Tt]hru|[Tt]ho|[Gg]onna|[Ww]anna|[Kk]inda|[Ss]orta|[Ss]tuff|lol|LOL|ppl|u|ur|bc)\b|\s&\s|\bw\/\s/;

/** Her typed answer as clean first-person text, same meaning: "CBT stuff" -> "CBT", "thru" -> "through". */
export function tidyOwnWords(s: string): string {
  let t = ` ${s.trim()} `
    .replace(/\s+(?:and )?(?:stuff|things like that|etc\.?)(?=[\s.,;!?])/gi, "")
    .replace(/\bthru\b/gi, "through")
    .replace(/\btho\b/gi, "though")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\bkinda\b/gi, "somewhat")
    .replace(/\bsorta\b/gi, "somewhat")
    .replace(/\bppl\b/gi, "people")
    .replace(/\bw\/(?=\s)/gi, "with")
    .replace(/\b(?:b\/c|bc)\b/gi, "because")
    .replace(/\bu\b/g, "you")
    .replace(/\bur\b/g, "your")
    .replace(/\blol\b/gi, "")
    .replace(/\s&\s/g, " and ")
    .replace(/\bi\b/g, "I")
    .replace(/\s+([,.;!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  t = t.replace(/^[a-z]/, (c) => c.toUpperCase());
  return t;
}

/** "We" for her solo practice turned into "I", only where it's clearly the practice speaking. */
export function firstPerson(text: string): string {
  const keep = (word: string, to: string) => (word[0] === word[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);
  return text
    .replace(/\b([Ww]e) (are|'re)\b/g, (_m, w) => `${keep(w, "I")} am`)
    .replace(/\b([Ww]e)'re\b/g, (_m, w) => `${keep(w, "I")}'m`)
    .replace(/\b([Ww]e) (offer|accept|take|bill|charge|provide|see|specialize|work with|do not|don't|have|'ve|give|send|keep|ask)\b/g, (_m, w, v) => `${keep(w, "I")} ${v}`)
    .replace(/\b([Ww]e)'ve\b/g, (_m, w) => `${keep(w, "I")}'ve`)
    .replace(/\b([Oo]ur) (practice|office|fees?|rates?|team|services|policy|policies|schedule|calendar|website|site|booking|intake|forms?)\b/g, (_m, w, n) => `${keep(w, "my")} ${n}`)
    .replace(/\b(contact|reach|call|email|text|message|with|join) us\b/gi, "$1 me");
}

/** Drops whole sentences built on a filler phrase, unless that would empty the text. */
export function dropFiller(text: string): string {
  const paras = text.split(/\n{2,}/).map((p) => {
    const kept = sentences(p).filter((s) => !FILLER.some((f) => f.test(s)));
    return kept.length ? kept.join(" ") : p;
  });
  return paras.join("\n\n");
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The fee-label template bug: "It costs First session (intake): $200" -> "First session (intake) is $200". */
export function fixFeeLabels(text: string, t: Pick<TruthFacts, "fees">): string {
  let out = text;
  for (const fee of t.fees) {
    const re = new RegExp(`\\b(?:(?:it|this|that|a session|sessions?)\\s+)?(?:costs?|is|are|runs)\\s+${escapeRe(fee.label)}:\\s*${escapeRe(money(fee.cents))}`, "gi");
    out = out.replace(re, (m) => {
      const s = feeSentence(fee);
      return /^[A-Z]/.test(m) ? s : s[0].toLowerCase() + s.slice(1);
    });
  }
  return out;
}

function feeSentence(fee: { label: string; cents: number }): string {
  const ft = feeText(fee); // "$200 for a first session (intake)"
  const [amount, rest] = [ft.slice(0, ft.indexOf(" for ")), ft.slice(ft.indexOf(" for ") + 5)];
  return `${rest[0].toUpperCase()}${rest.slice(1)} is ${amount}`;
}

/** Superbill cadence she never set, rewritten to what she does: on request. */
export function fixCadence(text: string): string {
  return text
    .replace(/\b(?:each|every|once a) (?:month|week)(?:,)?\s+(?:we|I) (?:can |will )?(?:give|send|email) you an? superbills?/gi, (m) => (/^[A-Z]/.test(m) ? "On request, I can give you a superbill" : "on request, I can give you a superbill"))
    .replace(/\b(?:monthly|weekly|automatic)\s+(superbills?)\b/gi, (m, word: string) => `${/^[A-Z]/.test(m) ? word[0].toUpperCase() + word.slice(1) : word} on request`)
    .replace(/\b(superbills?)\b([^.!?\n]{0,40}?)\s+(?:each|every|once a) (?:month|week|session|visit)\b/gi, "$1$2 on request")
    .replace(/\b(superbills?)\b([^.!?\n]{0,40}?)\s+(?:monthly|weekly|automatically)\b/gi, "$1$2 on request");
}

/** Every safe plain-code repair, in order. What's left wrong is for the critic to block. */
export function repairCopy(text: string, t: TruthFacts): string {
  let out = fixFeeLabels(text, t);
  out = fixCadence(out);
  out = dropFiller(out);
  if (t.solo) out = firstPerson(out);
  return out;
}
