// The practice facts every piece of Media copy must agree with (posts, captions,
// slides, reels, Psychology Today boxes, website pages), and the plain-code
// checks and repairs run after Muse writes. Facts come from lib/media/facts.ts
// (loadMediaFacts) at generation time, never from a cache or a constant here, so a
// fee or insurer she changes in chat reaches the very next draft.
//
// factProblems() is the ONE fee, insurer and claim check: the post critic
// (lib/instagram/critic.ts), the directory and website lint (lib/media/lint.ts) and
// the studio all call it, so every surface gets the same rules. repairCopy() fixes
// only what can't change her meaning (the fee-label template, a stand-alone filler
// clause, "we" for a solo practice, a superbill sentence that says nothing else);
// anything less certain is left in her words and flagged for the critic instead.
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
  /** She offers a sliding scale / reduced fees: true, false, or null when she hasn't said. */
  slidingScale: boolean | null;
  telehealth: boolean;
  /** "Lincoln Park, Chicago". */
  place: string;
  /** Languages besides English, in her words ("" = none given). */
  languages: string;
  /** School and degree lines she gave (never sample data). */
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
    consultKnown: f.answers.freeConsultMinutes > 0 || f.answers.consultAsked,
    slidingScale: f.slidingScale,
    telehealth: f.telehealth,
    place: [f.neighborhood, f.city].filter(Boolean).join(", "),
    languages: f.answers.languages,
    education: f.education,
    solo: true,
  };
}

export const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

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
export function insuranceLine(t: Pick<TruthFacts, "inNetwork">): string {
  if (t.inNetwork.length) return `In network with ${list(t.inNetwork)}. For other plans, a superbill on request.`;
  return "Not in network with any plan yet (out of network). Clients can ask for a superbill to send to their insurer.";
}

/** The fact sheet for a generation prompt. Facts only: nothing here may be changed or added to. */
export function factSheet(t: TruthFacts): string[] {
  return [
    `- Prices (the only ones that exist): ${t.fees.length ? t.fees.map(feeText).join("; ") : "none listed: do not mention any price"}. Write a price inside a sentence ("A first session is $200."), never as "Label: $200" after a verb, never as a range.`,
    `- Insurance: ${insuranceLine(t)} ${t.inNetwork.length ? "Never say she is private pay, out of network only, or doesn't take insurance." : "Never say she is in network or takes insurance."} Never say "most insurance" or "most plans"; name no other plan.${t.insurers.length > t.inNetwork.length ? ` Applying to ${list(t.insurers.filter((x) => !t.inNetwork.includes(x)))}: not in network yet.` : ""}`,
    "- Superbills: given on request. Never say how often (monthly, weekly, after each session) or that they are automatic.",
    `- Sliding scale or reduced fees: ${t.slidingScale ? "she offers a sliding scale" : "not offered: never mention one"}.`,
    `- Free consult: ${t.freeConsultMinutes ? `a free ${t.freeConsultMinutes}-minute call` : t.consultKnown ? "none: do not offer one" : "not set: say 'book a consult' without a length or price"}.`,
    `- Where: in person in ${t.place || "her office"}${t.telehealth ? ", and by video" : ""}.`,
    `- Languages: ${t.languages ? `English and ${t.languages}` : "not given: never mention languages"}.`,
  ];
}

// ---- prices -------------------------------------------------------------------------------

const UNITS: Record<string, number> = {
  zero: 0, one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const NUM_WORD = `(?:${[...Object.keys(UNITS), "hundred", "thousand"].join("|")})`;

/** "one hundred and seventy-five" -> 175. */
export function wordsToNumber(words: string): number {
  let total = 0;
  let current = 0;
  for (const w of words.toLowerCase().split(/[\s-]+/).filter((x) => x && x !== "and")) {
    if (w === "hundred") current = (current || 1) * 100;
    else if (w === "thousand") {
      total += (current || 1) * 1000;
      current = 0;
    } else current += UNITS[w] ?? 0;
  }
  return total + current;
}

const NUM = String.raw`\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+(?:\.\d{2})?`;
const RANGE_SEP = String.raw`\s*(?:-|–|—|to)\s*`;
const toCents = (raw: string) => Math.round(Number(raw.replace(/,/g, "")) * 100);
const DOLLAR_WORDS = String.raw`(?:dollars?|bucks|usd)`;
const PER = String.raw`(?:per (?:session|hour|visit|appointment)|\/\s?(?:session|hour|visit)|(?:for )?an? (?:session|hour|visit))`;

/** Every price the text states, in cents, with how it was written. Ranges give both ends. */
export function priceMentions(text: string): { cents: number; shown: string }[] {
  const out: { cents: number; shown: string }[] = [];
  const add = (raw: string, shown: string) => out.push({ cents: toCents(raw), shown: shown.trim() });
  // $150, $1,500.00, $150-200, $150 to $200, $150–$200
  for (const m of text.matchAll(new RegExp(String.raw`\$\s?(${NUM})(?:${RANGE_SEP}\$?\s?(${NUM}))?`, "g"))) {
    add(m[1], `$${m[1]}`);
    if (m[2]) add(m[2], `$${m[2]}`);
  }
  // 175 dollars, 150-200 USD, 150 per session, 150/session
  for (const m of text.matchAll(new RegExp(String.raw`(?<![$\d.,])\b(${NUM})(?:${RANGE_SEP}(${NUM}))?\s*(?:${DOLLAR_WORDS}|${PER})\b`, "gi"))) {
    if (/\bminutes?\b/i.test(m[0])) continue;
    add(m[1], m[0]);
    if (m[2]) add(m[2], m[0]);
  }
  // one hundred and seventy-five dollars
  for (const m of text.matchAll(new RegExp(String.raw`\b(${NUM_WORD}(?:[\s-]+(?:and[\s-]+)?${NUM_WORD})*)\s+${DOLLAR_WORDS}\b`, "gi"))) {
    const n = wordsToNumber(m[1]);
    if (n > 0) out.push({ cents: n * 100, shown: m[0] });
  }
  return out;
}

/** Prices her fee list doesn't have. */
export function priceProblems(text: string, feesCents: number[]): FactProblem[] {
  const known = new Set(feesCents);
  const bad = priceMentions(text).filter((p) => !known.has(p.cents));
  return [...new Map(bad.map((p) => [p.cents, p])).values()].map((p) => ({ kind: "fee" as const, message: `states the fee ${money(p.cents)}, which isn't on your fee list` }));
}

// ---- insurers ------------------------------------------------------------------------------

/** Payer names, with spacing and spelling variants, grouped by company family. */
const PAYERS: { name: string; re: RegExp; family: string }[] = [
  { name: "Blue Cross", re: /\bblue[\s-]?cross\b/i, family: "bcbs" },
  { name: "Blue Shield", re: /\bblue[\s-]?shield\b/i, family: "bcbs" },
  { name: "BCBS", re: /\bbcbs(?:il)?\b/i, family: "bcbs" },
  { name: "Anthem", re: /\banthem\b/i, family: "elevance" },
  { name: "Elevance", re: /\belevance\b/i, family: "elevance" },
  { name: "WellPoint", re: /\bwell[\s-]?point\b/i, family: "elevance" },
  { name: "Amerigroup", re: /\bameri[\s-]?group\b/i, family: "elevance" },
  { name: "UnitedHealthcare", re: /\bunited[\s-]?health(?:[\s-]?care)?\b/i, family: "united" },
  { name: "UHC", re: /\buhc\b/i, family: "united" },
  { name: "Optum", re: /\boptum\b/i, family: "united" },
  { name: "UMR", re: /\bumr\b/i, family: "united" },
  { name: "Aetna", re: /\baetna\b/i, family: "aetna" },
  { name: "Cigna", re: /\bcigna\b/i, family: "cigna" },
  { name: "Evernorth", re: /\bevernorth\b/i, family: "cigna" },
  { name: "Humana", re: /\bhumana\b/i, family: "humana" },
  { name: "Magellan", re: /\bmagellan\b/i, family: "magellan" },
  { name: "Carelon", re: /\bcarelon\b/i, family: "carelon" },
  // Capitalised only: "a beacon" is an everyday word.
  { name: "Beacon", re: /\bBeacon(?:\s+Health(?:\s+Options)?)?\b/, family: "carelon" },
  { name: "Medica", re: /\bmedica\b/i, family: "medica" },
  { name: "Medicare", re: /\bmedicare\b/i, family: "medicare" },
  { name: "Medicaid", re: /\bmedicaid\b/i, family: "medicaid" },
  ...["Oscar", "Tricare", "TriWest", "Meridian", "Ambetter", "Kaiser", "Molina", "Centene", "WellCare", "CountyCare", "Health Alliance", "Harvard Pilgrim", "Highmark", "Premera", "Regence", "MultiPlan", "First Health", "Cofinity", "Lyra", "Spring Health", "Headway", "ComPsych", "Health Net", "GEHA", "Meritain", "Lucet", "New Directions", "ValueOptions"].map((n) => ({
    name: n,
    re: new RegExp(`\\b${n.replace(/([a-z])([A-Z])/g, "$1 ?$2").replace(/ /g, "[\\s-]?")}\\b`, "i"),
    family: n.toLowerCase().replace(/\s/g, ""),
  })),
];

/** The payer families a list of plan names belongs to. */
export function familiesOf(plans: string[]): Set<string> {
  return new Set(plans.flatMap((p) => PAYERS.filter((x) => x.re.test(p)).map((x) => x.family)));
}

/** Plans the text names that she isn't with, and "in network with X" for a plan that hasn't approved her. */
export function insurerProblems(text: string, t: Pick<TruthFacts, "insurers" | "inNetwork">): FactProblem[] {
  const out: FactProblem[] = [];
  const hers = familiesOf(t.insurers);
  for (const p of PAYERS) if (p.re.test(text) && !hers.has(p.family)) out.push({ kind: "insurer", message: `names ${p.name}, which isn't one of your plans` });
  const approved = familiesOf(t.inNetwork);
  for (const m of text.matchAll(/\bin[- ]network with ([^.;:!?\n]+)/gi)) {
    for (const part of m[1].split(/,\s*|\s+and\s+|\s+or\s+/i).map((x) => x.trim()).filter(Boolean)) {
      const fam = familiesOf([part]);
      const ok = fam.size ? [...fam].every((f) => approved.has(f)) : t.inNetwork.some((p) => p.toLowerCase().includes(part.toLowerCase()) || part.toLowerCase().includes(p.toLowerCase()));
      if (!ok) out.push({ kind: "insurance_claim", message: `says you're in network with ${part}, which hasn't approved you` });
    }
  }
  return out;
}

// ---- claims --------------------------------------------------------------------------------

export type FactKind = "fee" | "insurer" | "insurance_claim" | "superbill" | "sliding_scale" | "consult" | "language" | "education";
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
  /\b(?:i'?m|i am|we'?re|we are) not in[- ]network\b(?! (?:with|for|on)\b)/i,
];
const TAKES_INSURANCE = [/\b(?:i'?m|i am|we'?re|we are) in[- ]network\b/i, /\b(?:i|we) (?:take|accept|bill) (?:\w+ )?insurance\b/i, /\binsurance (?:is )?accepted\b/i];
/** Vague claims no fact can back, whatever her plans: always flagged. */
const MOST_INSURANCE = [
  /\b(?:accepts?|takes?|work with|bill) (?:most|all|any|many|major) (?:major )?(?:health )?(?:insurances?|plans|insurers|carriers)\b/i,
  /\b(?:most|all|many) (?:major )?(?:health )?(?:insurances?|plans|insurers|carriers) (?:are )?(?:accepted|welcome|taken)\b/i,
  /\bmost insurance\b/i,
];

const CADENCE = [
  /\bsuperbills?\b[^.!?\n]{0,60}?\b(?:each|every|per|once a|after (?:each|every)) (?:month|week|session|visit)\b/i,
  /\b(?:each|every|once a) (?:month|week)\b[^.!?\n]{0,40}?\bsuperbills?\b/i,
  /\b(?:monthly|weekly|automatic(?:ally)?)\s+superbills?\b/i,
  /\bsuperbills?\b[^.!?\n]{0,40}?\b(?:monthly|weekly|automatically)\b/i,
];

const SLIDING = /\b(?:sliding[- ]scale|reduced[- ](?:fees?|rates?|cost)|low[- ](?:cost|fee) (?:sessions?|spots?|options?)|discounted (?:rates?|fees?|sessions?)|pay what you can)\b/i;
const NO_SLIDING = /\b(?:no|not|don'?t|do not|doesn'?t)\b[^.!?\n]{0,25}\b(?:sliding[- ]scale|reduced[- ](?:fees?|rates?))\b/i;

const LANGS = [
  "Spanish", "Polish", "Mandarin", "Cantonese", "Chinese", "Arabic", "French", "Korean", "Hindi", "Urdu", "Tagalog", "Vietnamese",
  "Russian", "Portuguese", "German", "Italian", "ASL", "American Sign Language", "Ukrainian", "Gujarati", "Japanese", "Hebrew",
  "Greek", "Farsi", "Persian", "Haitian Creole", "Bengali", "Punjabi", "Swahili", "Somali", "Amharic", "Yiddish", "Turkish",
];
const ENGLISH_ONLY = /\b(?:english only|only (?:in )?english|(?:i|we) (?:only )?speak english|english[- ]speaking only)\b/i;

const SCHOOL = /\b(?:University of [A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*|(?:[A-Z][A-Za-z.&'-]+ )+(?:University|College|Institute|Seminary))\b/g;
const SCHOOL_FILLER = new Set(["university", "college", "institute", "seminary", "of", "the", "state", "school"]);

/** Promises of how therapy turns out. One list for posts (critic outcome_promise) and profiles (lint guarantee). */
export const OUTCOME_PROMISE: RegExp[] = [
  /\b(?:guarantee[ds]?|cured?|cures|fix (?:your|you)|100% (?:better|success)|proven to|results in \d+|in just \d+ (?:sessions|weeks|days))\b/i,
  /\byou(?:'ll| will) (?:feel|be|get) (?:better|happier|healed|calmer|less anxious|fixed|free)\b/i,
  /\b(?:get rid of|eliminate|end) (?:your )?(?:anxiety|depression|trauma|panic|stress)\b/i,
  /\b(?:life[- ]changing|transform your life|never feel)\b/i,
  /\b100 ?% (?:success|effective)\b|\bproven (?:results?|to work)\b|\bpermanent (?:relief|results?)\b|\bworks every time\b/i,
  /\bwill (?:feel|get|be) (?:better|happier|healed|cured|fixed|calmer|less anxious)\b/i,
  /\b(?:eliminate|end|get rid of) your\b/i,
  /\bin (?:just |only )?\d+ (?:sessions?|weeks?|days?)\b/i,
];

/**
 * The one fee, insurer and claim check, for every Media surface: claims her saved
 * details contradict or don't hold.
 */
export function factProblems(text: string, t: TruthFacts): FactProblem[] {
  const clean = text.replace(/[’‘]/g, "'");
  const out: FactProblem[] = [...priceProblems(clean, t.fees.map((f) => f.cents)), ...insurerProblems(clean, t)];
  if (t.inNetwork.length && NO_INSURANCE.some((p) => p.test(clean)))
    out.push({ kind: "insurance_claim", message: `says you don't take insurance, but you're in network with ${list(t.inNetwork)}` });
  const most = MOST_INSURANCE.some((p) => p.test(clean));
  if (!most && !t.inNetwork.length && TAKES_INSURANCE.some((p) => p.test(clean)))
    out.push({ kind: "insurance_claim", message: "says you take insurance, but no plan has approved you yet" });
  if (most)
    out.push({ kind: "insurance_claim", message: `says you take most insurance; name only your plans${t.inNetwork.length ? ` (${list(t.inNetwork)})` : ""}` });
  if (CADENCE.some((p) => p.test(clean))) out.push({ kind: "superbill", message: "says when superbills go out; you give them on request" });
  if (SLIDING.test(clean) && !NO_SLIDING.test(clean) && t.slidingScale !== true) out.push({ kind: "sliding_scale", message: "offers a sliding scale or reduced fee you haven't said you offer" });
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
  const seen = new Set<string>();
  return out.filter((x) => (seen.has(x.message) ? false : (seen.add(x.message), true)));
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
  /\bI (?:left|kept)\b[^.!?]{0,60}\b(?:blank|empty|unfilled|for now)\b/i,
  /\b(?:placeholder|lorem ipsum|TBD)\b/i,
  /\b(?:you can|you'?ll want to|be sure to|remember to) (?:edit|change|replace|update|fill in|add) (?:this|these|the|your)\b/i,
  /^\s*note:/i,
];

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());

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

/** Casual words in her answers that read wrong in a profile or post (flagged; only the certain ones are tidied). */
export const CASUAL = /\b(?:[Tt]hru|[Tt]ho|[Gg]onna|[Ww]anna|[Kk]inda|[Ss]orta|[Ss]tuff|lol|LOL|ppl|u|ur)\b|\bbc(?= (?:i|it|they|we|you|he|she|my|of|the|that|there)\b)|\s&\s|\bw\/\s/;

/**
 * Her typed answer with only the casual words whose meaning is certain fixed
 * ("thru" -> "through", a trailing "and stuff"); anything else stays in her words.
 */
export function tidyOwnWords(s: string): string {
  let t = ` ${s.trim()} `
    // A trailing "and stuff" / "and stuff like that" at the end of a sentence, as a whole phrase.
    .replace(/,?\s+and stuff(?: like that)?(?=\s*(?:[.!?]|$))/gi, "")
    .replace(/\bthru\b/gi, "through")
    .replace(/\btho\b/gi, "though")
    .replace(/\bgonna\b/gi, "going to")
    .replace(/\bwanna\b/gi, "want to")
    .replace(/\bppl\b/gi, "people")
    .replace(/\bw\/(?=\s)/gi, "with")
    // Lower case only, and only where it reads as "because": "BC certified" stays.
    .replace(/\bb\/c\b|\bbc(?= (?:i|it|they|we|you|he|she|my|of|the|that|there)\b)/g, "because")
    .replace(/\bu\b/g, "you")
    .replace(/\bur\b/g, "your")
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
    .replace(/\b([Ww]e)'ll\b/g, (_m, w) => `${keep(w, "I")}'ll`)
    .replace(/\b([Ww]e)'ve\b/g, (_m, w) => `${keep(w, "I")}'ve`)
    .replace(/\b([Ww]e)'d\b/g, (_m, w) => `${keep(w, "I")}'d`)
    .replace(/\b([Ww]e) meet\b/g, (_m, w) => `${keep(w, "I")} meet with clients`)
    .replace(/\b([Ww]e) (offer|accept|take|bill|charge|provide|see|specialize|work with|do not|don't|have|give|send|keep|ask|can|can't|cannot|will|help)\b/g, (_m, w, v) => `${keep(w, "I")} ${v}`)
    .replace(/\b([Oo]ur) (practice|office|fees?|rates?|team|services|policy|policies|schedule|calendar|website|site|booking|intake|forms?)\b/g, (_m, w, n) => `${keep(w, "my")} ${n}`)
    .replace(/\b(contact|reach|call|email|text|message|with|join) us\b/gi, "$1 me");
}

const FACTISH = /\$|\d|\bsuperbills?\b|\bconsult|\binsurance\b|\bin[- ]network\b|\bbook\b/i;

/**
 * Strips only the filler clause ("No pressure," / "I look forward to meeting you"),
 * never a clause that carries a fact. A filler clause with a fact in it stays and is flagged.
 */
export function dropFiller(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => {
      const kept = sentences(para).flatMap((s) => {
        if (!FILLER.some((f) => f.test(s))) return [s];
        const parts = s.split(/([,;:]\s+|\s+[—–]\s+)/);
        const out: string[] = [];
        for (let i = 0; i < parts.length; i += 2) {
          const clause = parts[i];
          if (FILLER.some((f) => f.test(clause)) && !FACTISH.test(clause)) continue;
          if (out.length) out.push(parts[i - 1] ?? " ");
          out.push(clause);
        }
        let joined = out.join("").trim().replace(/^[,;:—–\s]+/, "");
        if (!joined) return [];
        if (!/[.!?]$/.test(joined)) joined += s.trim().match(/[.!?]$/)?.[0] ?? ".";
        return [joined[0].toUpperCase() + joined.slice(1)];
      });
      return kept.length ? kept.join(" ") : para;
    })
    .join("\n\n");
}

/** The fee-label template bug: "It costs First session (intake): $200" -> "A first session (intake) is $200". */
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

/** What she does about superbills, as one fixed sentence. */
export const SUPERBILL_SENTENCE = "I can give you a superbill on request.";

/**
 * A sentence that only gives a superbill schedule she never set is replaced whole by
 * SUPERBILL_SENTENCE. A sentence that also says anything else (a price, a number, a
 * second clause) is left in her words; the fact check flags it.
 */
export function fixCadence(text: string): string {
  return text
    .split(/(?<=[.!?])(\s+)/)
    .map((s) => {
      if (!CADENCE.some((p) => p.test(s))) return s;
      const onlySuperbill = !/[$\d]/.test(s) && !/[,;:]/.test(s.trim().slice(0, -1)) && !/\b(?:and|but|also|plus)\b/i.test(s) && s.trim().length <= 100;
      return onlySuperbill ? SUPERBILL_SENTENCE : s;
    })
    .join("");
}

/** Every safe plain-code repair, in order. What's left wrong is for the critic to block. */
export function repairCopy(text: string, t: TruthFacts): string {
  let out = fixFeeLabels(text, t);
  out = fixCadence(out);
  out = dropFiller(out);
  if (t.solo) out = firstPerson(out);
  return out;
}
