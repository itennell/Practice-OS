// Plain-code checks for anything Aeon writes for a directory profile or her
// website. Stricter than Illinois law on purpose (docs/research.md > Media
// presence, section 5; rule ids match docs/research/media-presence.json). Not
// legal advice: it catches the common mistakes, she stays responsible.
//
// "block" means the text is not offered as written; "warn" shows a hint beside it.
import type { MediaFacts } from "./facts";

export type LintRule =
  | "too_long"
  | "testimonial"
  | "client_story"
  | "guarantee"
  | "superlative"
  | "featured"
  | "incentive"
  | "advice"
  | "crisis_topic"
  | "license_number"
  | "wrong_designation"
  | "unknown_fact"
  | "designation"
  | "soft_outcome"
  | "availability"
  | "readability";

export type Finding = { rule: LintRule; severity: "block" | "warn"; message: string };

const R = (s: string) => new RegExp(s, "i");

const BLOCK: { rule: LintRule; patterns: RegExp[]; message: string }[] = [
  {
    rule: "testimonial",
    patterns: [
      R(String.raw`\b(clients?|patients?) (say|says|are saying|rave|love)\b`),
      R(String.raw`\bwhat (my )?(clients?|patients?) (say|think)\b`),
      R(String.raw`\btestimonials?\b`),
      R(String.raw`\b(client|google|five[- ]star|5[- ]star) reviews?\b`),
      R(String.raw`\b[1-5](\.\d)? ?(out of 5 )?stars?\b`),
      /★|⭐/,
      R(String.raw`\bsuccess stor(y|ies)\b`),
      R(String.raw`\b(changed|saved) my life\b`),
      R(String.raw`\bI (loved|highly recommend) working with\b`),
    ],
    message: "Reads like a testimonial or review. Therapist ethics codes and the FTC rules rule these out.",
  },
  {
    rule: "client_story",
    patterns: [
      R(String.raw`\bone of my (current |former |past )?(clients?|patients?)\b`),
      R(String.raw`\ba (recent |former |past )?(client|patient) (of mine|came|told|who)\b`),
      R(String.raw`\bcase (study|example)\b`),
      R(String.raw`\bclient stor(y|ies)\b`),
      R(String.raw`\bI (once )?(worked|met) with an? (man|woman|teen|couple|veteran|mom|dad|mother|father)\b`),
    ],
    message: "Tells a story about a client. Profiles never describe a client, even a made-up one.",
  },
  {
    rule: "guarantee",
    patterns: [
      R(String.raw`\bguarantee[sd]?\b`),
      R(String.raw`\b100 ?% (success|effective)\b`),
      R(String.raw`\bproven (results?|to work)\b`),
      R(String.raw`\bwill (feel|get|be) (better|healed|cured|fixed)\b`),
      R(String.raw`\byou'?ll (feel|be) (better|healed|free)\b`),
      R(String.raw`\bcur(e|es|ed)\b`),
      R(String.raw`\b(eliminate|end|get rid of) your\b`),
      R(String.raw`\bin (just |only )?\d+ (sessions?|weeks?|days?)\b`),
      R(String.raw`\bpermanent (relief|results?)\b`),
      R(String.raw`\btransform your life\b`),
      R(String.raw`\bworks every time\b`),
    ],
    message: "Promises a result. Ethics codes don't allow promising how therapy will turn out.",
  },
  {
    rule: "superlative",
    patterns: [
      R(String.raw`\bbest\b.{0,20}\b(therapist|counselor|clinician|practice|in (chicago|illinois|town))\b`),
      R(String.raw`\b(top[- ]rated|leading|premier|foremost|finest)\b`),
      R(String.raw`\btop (therapist|counselor|clinician)s?\b`),
      R(String.raw`#\s?1\b|\bnumber (one|1)\b`),
      R(String.raw`\bmost (experienced|trusted|qualified|effective)\b`),
      R(String.raw`\bworld[- ]class\b|\bunmatched\b|\bunrivaled\b|\baward[- ]winning\b`),
      R(String.raw`\bthe only (therapist|counselor|clinician)\b`),
    ],
    message: "A ranking nobody can check. Illinois rules say advertising can't be misleading.",
  },
  {
    rule: "featured",
    patterns: [R(String.raw`\b(as (featured|seen) (in|on)|trusted by|recommended by (doctors|physicians))\b`)],
    message: "Claims an endorsement Aeon can't show a source for.",
  },
  {
    rule: "incentive",
    patterns: [R(String.raw`\b(discount|gift|free session|bonus|reward)s? (for|when you) (a )?(review|referr)`), R(String.raw`\breferral (bonus|reward|discount)\b`)],
    message: "Offers something of value for a review or a referral, which is never allowed.",
  },
  {
    rule: "advice",
    patterns: [
      R(String.raw`\b(you should|you need to|make sure you)\b`),
      R(String.raw`\b(tips|ways|steps) (to|for) (cope|coping|manage|managing|heal|healing|deal|dealing|reduce|calm)\b`),
      R(String.raw`\bhow to (cope|manage|heal|deal with|calm)\b`),
      R(String.raw`\bsigns (that )?you (have|are|might)\b`),
      R(String.raw`\bdo you (have|suffer from)\b`),
      R(String.raw`\bdiagnos(e|is|ed|ing)\b`),
    ],
    message: "Sounds like mental health advice or a diagnosis. A profile describes the practice, not what readers should do.",
  },
  {
    rule: "crisis_topic",
    patterns: [R(String.raw`\b(suicid\w*|self[- ]harm\w*|kill (myself|yourself)|overdos\w*)\b`)],
    message: "Mentions suicide, self-harm or overdose. Aeon keeps these out of marketing text; she can add her own wording herself.",
  },
  {
    rule: "license_number",
    patterns: [R(String.raw`\b\d{3}[.\-]\d{6}\b`), R(String.raw`\blicen[cs]e (no\.?|number|#)\s*:?\s*\w*\d`)],
    message: "Shows a license number. Psychology Today shows the verified number itself; Aeon never writes one.",
  },
];

const WARN: { rule: LintRule; patterns: RegExp[]; message: string }[] = [
  {
    rule: "soft_outcome",
    patterns: [R(String.raw`\b(heal|healing|overcome|find relief|freedom from|get better|recover)\b`)],
    message: "Hints at a result. Fine if it's how she talks, but read it once more.",
  },
  {
    rule: "availability",
    patterns: [R(String.raw`\b(24/7|same[- ]day|always available|emergenc(y|ies)|immediate openings)\b`)],
    message: "Her practice isn't a crisis service. Say when she really answers.",
  },
];

/** Every license title and its accepted forms. A title she doesn't hold is blocked. */
const TITLES: Record<string, RegExp[]> = {
  LCPC: [/\bLCPC\b/, /\bL\.?P\.?C\.?\b/, /licensed (clinical )?professional counselor/i],
  LCSW: [/\bLCSW\b/, /\bLSW\b/, /licensed (clinical )?social worker/i],
  LMFT: [/\bLMFT\b/, /licensed marriage and family therapist/i],
  Psychologist: [/licensed (clinical )?psychologist/i, /\bPsy\.?D\b/, /\bPh\.?D\b/],
};

/** Her own license titles, for the designation rule. Unknown credentials pass. */
export function designationOf(credential: string): RegExp[] {
  return TITLES[credential] ?? [new RegExp(`\\b${credential.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)];
}

const INSURERS = [
  "aetna",
  "cigna",
  "evernorth",
  "blue cross",
  "bcbs",
  "anthem",
  "unitedhealthcare",
  "united healthcare",
  "optum",
  "humana",
  "magellan",
  "oscar",
  "tricare",
  "medicare",
  "medicaid",
  "meridian",
  "ambetter",
  "carelon",
  "kaiser",
];

/** Facts in the text that aren't in her saved details: fees, years, free consult, insurers, titles. */
function unknownFacts(text: string, f: MediaFacts): string[] {
  const out: string[] = [];
  const cents = new Set(f.fees.map((x) => x.cents));
  for (const m of text.matchAll(/\$\s?(\d{1,4}(?:,\d{3})?(?:\.\d{2})?)/g)) {
    const c = Math.round(Number(m[1].replace(/,/g, "")) * 100);
    if (!cents.has(c)) out.push(`the fee ${m[0]}`);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\+? years?\b/gi)) {
    if (f.answers.yearsInPractice === null || Number(m[1]) !== f.answers.yearsInPractice) out.push(`"${m[0]}"`);
  }
  if (/\bfree\b[^.]{0,30}\b(consult\w*|call|phone call|session)\b/i.test(text) && !f.answers.freeConsultMinutes) out.push("a free consult");
  for (const m of text.matchAll(/\b(\d{2})[- ]minute\b[^.]{0,20}\b(consult\w*|call)\b/gi)) {
    if (Number(m[1]) !== f.answers.freeConsultMinutes) out.push(`a ${m[1]}-minute consult`);
  }
  const lower = text.toLowerCase();
  const hers = f.insurers.map((p) => p.toLowerCase()).join(" | ");
  for (const name of INSURERS) {
    if (new RegExp(`\\b${name}\\b`).test(lower) && !hers.includes(name)) out.push(name.replace(/\b\w/g, (c) => c.toUpperCase()));
  }
  if (/\bDr\.\s/.test(text) && f.credential !== "Psychologist") out.push('"Dr."');
  for (const [title, forms] of Object.entries(TITLES)) {
    if (title !== f.credential && forms.some((p) => p.test(text))) out.push(`the title ${title}`);
  }
  return [...new Set(out)];
}

const SYLLABLE = /[aeiouy]+/g;
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "").replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "");
  return Math.max(1, (w.match(SYLLABLE) ?? []).length);
}

/** Flesch-Kincaid grade of a short text (plain approximation, good enough for a hint). */
export function readingGrade(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => /\w/.test(s));
  const words = text.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
  if (!words.length || !sentences.length) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
}

/** Checks one piece of text against its limit and every rule. */
export function lintText(text: string, f: MediaFacts, opts: { limit?: number | null } = {}): Finding[] {
  const out: Finding[] = [];
  if (opts.limit && text.length > opts.limit)
    out.push({ rule: "too_long", severity: "block", message: `${text.length} characters; this box takes ${opts.limit}.` });
  for (const r of BLOCK) if (r.patterns.some((p) => p.test(text))) out.push({ rule: r.rule, severity: "block", message: r.message });
  for (const m of unknownFacts(text, f)) {
    const rule: LintRule = m.startsWith("the title") || m === '"Dr."' ? "wrong_designation" : "unknown_fact";
    out.push({ rule, severity: "block", message: `Mentions ${m}, which isn't in your saved details.` });
  }
  for (const r of WARN) if (r.patterns.some((p) => p.test(text))) out.push({ rule: r.rule, severity: "warn", message: r.message });
  const long = text.split(/[.!?]+(?:\s|$)/).some((s) => (s.match(/\S+/g) ?? []).length > 25);
  if (readingGrade(text) > 8 || long)
    out.push({ rule: "readability", severity: "warn", message: "Could be simpler. Short sentences and everyday words read best." });
  return out;
}

/** Profile-wide rule: her license title appears somewhere in what she pastes. */
export function lintDesignation(texts: string[], f: MediaFacts): Finding | null {
  const forms = designationOf(f.credential);
  if (texts.some((t) => forms.some((p) => p.test(t)))) return null;
  return { rule: "designation", severity: "block", message: `Add your license title (${f.credential}) next to your name.` };
}

export const blocks = (fs: Finding[]) => fs.some((x) => x.severity === "block");
