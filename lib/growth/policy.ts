// The plain-code ad policy check. Every Google or Meta ad draft must pass it before
// it can be queued for her approval, and the executor checks it again.
//
// Rules (research, not legal advice):
// - Google: health is a sensitive interest category, so no remarketing, Customer
//   Match or health audiences; ads must not imply knowledge of the viewer's condition;
//   addiction treatment and prescribing telemedicine need certification
//   (docs/research.md > Growth agent, section 1;
//   https://support.google.com/adspolicy/answer/176031,
//   https://support.google.com/adspolicy/answer/143465).
//   Responsive search ads: headlines up to 30 characters, descriptions up to 90,
//   display paths up to 15 (https://support.google.com/google-ads/answer/7684791).
// - Meta: ads must not assert or imply a person's physical or mental health, e.g.
//   "Do you have diabetes?" (Privacy Violations and Personal Attributes,
//   https://transparency.meta.com/policies/ad-standards/objectionable-content/privacy-violations-personal-attributes);
//   health-related detailed targeting options were removed on 2022-01-19
//   (https://www.facebook.com/business/news/removing-certain-ad-targeting-options-and-expanding-our-ad-controls),
//   so these drafts use location and broad age only. Meta suggests about 125
//   characters of primary text and 40 for a headline before it cuts them off.
// - Ethics codes: no testimonials, no guaranteed outcomes, no rankings
//   (docs/research.md > Growth agent, section 6). Never "HIPAA compliant".
import { lintText, type Finding } from "../media/lint";
import type { MediaFacts } from "../media/facts";

export const LIMITS = {
  googleHeadline: 30,
  googleDescription: 90,
  googlePath: 15,
  googleHeadlinesMin: 3,
  googleHeadlinesMax: 15,
  googleDescriptionsMin: 2,
  googleDescriptionsMax: 4,
  metaPrimary: 125,
  metaHeadline: 40,
  metaDescription: 30,
} as const;

export type PolicyRule =
  | "too_long"
  | "too_few"
  | "banned_claim"
  | "hipaa_claim"
  | "condition_targeting"
  | "personal_attribute"
  | "certification_keyword"
  | "audience_targeting"
  | "no_budget_cap"
  | "lint";

export type PolicyFinding = { rule: PolicyRule; severity: "block" | "warn"; where: string; message: string };
export type PolicyCheck = { ok: boolean; findings: PolicyFinding[]; checkedAt: string };

const R = (s: string) => new RegExp(s, "i");

/** Words no ad may say. */
const BANNED: { pattern: RegExp; message: string }[] = [
  { pattern: R(String.raw`\bcur(e|es|ed|ing)\b`), message: "Says therapy cures something." },
  { pattern: R(String.raw`\bguarantee[sd]?\b|\bguaranteed\b`), message: "Promises a result." },
  { pattern: R(String.raw`\bbest\b`), message: "\"Best\" is a ranking nobody can check." },
  { pattern: R(String.raw`#\s?1\b|\bnumber (one|1)\b|\btop[- ]rated\b|\bleading\b|\bpremier\b`), message: "A ranking nobody can check." },
  { pattern: R(String.raw`\btestimonials?\b|\breviews?\b|\b[1-5](\.\d)? ?stars?\b|★|⭐|\b(clients?|patients?) (say|love|rave)\b`), message: "Reads like a testimonial or review." },
  { pattern: R(String.raw`\b(proven|100 ?%|permanent|instant) (results?|relief|success)\b`), message: "Promises a result." },
  { pattern: R(String.raw`\b(suicid\w*|self[- ]harm\w*|overdos\w*)\b`), message: "Crisis topics stay out of ads." },
  { pattern: R(String.raw`\b(24/7|emergenc(y|ies)|crisis (line|help|care))\b`), message: "Her practice isn't a crisis service." },
  { pattern: R(String.raw`\b(prescri\w*|medication|meds)\b`), message: "Prescribing needs Google certification; she doesn't prescribe." },
];

const HIPAA = R(String.raw`\bhipaa\b`);

/** Wording that implies Aeon knows the viewer's condition (Google and Meta both refuse it). */
const PERSONAL = [
  R(String.raw`\b(your|you'?re|you are|are you|do you have|do you suffer|you suffer|you have|you'?ve got)\b[^.!?]{0,30}\b(anxi\w*|depress\w*|trauma\w*|ptsd|ocd|adhd|bipolar|panic|grief|griev\w*|eating disorder|addict\w*|insomnia|stress(ed)?|burn(ed|t)? ?out|lonely|sad|overwhelm\w*|struggl\w*|suffer\w*)\b`),
  R(String.raw`\b(struggling|suffering|battling|dealing) with\b`),
  R(String.raw`\b(feeling|feel) (anxious|depressed|hopeless|alone|overwhelmed|stuck)\b`),
];

/** Keywords that trigger Google certification (addiction treatment, prescribing). */
const CERT_KEYWORDS = R(String.raw`\b(rehab\w*|detox\w*|addict\w*|substance|alcohol\w*|drug\w*|opioid\w*|suboxone|methadone|prescri\w*|medication|psychiatri\w*|adderall|xanax|ketamine)\b`);

/** Audience settings these drafts must never use. */
export const FORBIDDEN_TARGETING = ["remarketing", "customer_match", "lookalike", "custom_audience", "health_interest", "detailed_targeting", "similar_audiences"] as const;

/** Media lint rules worth blocking an ad on (her saved facts, designation, advice, testimonials). */
const LINT_RULES = new Set(["testimonial", "client_story", "guarantee", "superlative", "featured", "incentive", "advice", "crisis_topic", "license_number", "wrong_designation", "unknown_fact"]);

export function checkText(text: string, where: string, limit: number | null, f: MediaFacts | null): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  if (limit !== null && [...text].length > limit) out.push({ rule: "too_long", severity: "block", where, message: `${[...text].length} characters; the limit is ${limit}.` });
  for (const b of BANNED) if (b.pattern.test(text)) out.push({ rule: "banned_claim", severity: "block", where, message: b.message });
  if (HIPAA.test(text)) out.push({ rule: "hipaa_claim", severity: "block", where, message: "Never claim HIPAA compliance in an ad." });
  if (PERSONAL.some((p) => p.test(text))) out.push({ rule: "personal_attribute", severity: "block", where, message: "Implies Aeon knows the reader's condition. Google and Meta both refuse this." });
  if (f) {
    for (const x of lintText(text, f) as Finding[]) {
      if (x.severity === "block" && LINT_RULES.has(x.rule)) out.push({ rule: "lint", severity: "block", where, message: x.message });
    }
  }
  return out;
}

export function checkKeyword(k: string, where = "keyword"): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  if (CERT_KEYWORDS.test(k)) out.push({ rule: "certification_keyword", severity: "block", where, message: `"${k}" can trigger Google's certification rules (addiction treatment or prescribing).` });
  if (PERSONAL.some((p) => p.test(k))) out.push({ rule: "condition_targeting", severity: "block", where, message: `"${k}" reads as targeting a person's condition.` });
  if (/\b(free therapy|cheap)\b/i.test(k)) out.push({ rule: "banned_claim", severity: "warn", where, message: `"${k}" may bring searches she can't serve.` });
  return out;
}

export function checkTargeting(t: { audiences?: string[]; interests?: string[]; monthlyCapCents: number | null }): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  for (const a of t.audiences ?? []) {
    if ((FORBIDDEN_TARGETING as readonly string[]).includes(a)) out.push({ rule: "audience_targeting", severity: "block", where: "targeting", message: `No ${a.replace(/_/g, " ")}: health is a sensitive category.` });
  }
  if ((t.interests ?? []).length) out.push({ rule: "audience_targeting", severity: "block", where: "targeting", message: "No interest or detailed targeting; location and broad age only." });
  if (!t.monthlyCapCents || t.monthlyCapCents <= 0) out.push({ rule: "no_budget_cap", severity: "block", where: "budget", message: "Set a hard monthly budget cap first." });
  return out;
}

export function result(findings: PolicyFinding[]): PolicyCheck {
  return { ok: !findings.some((x) => x.severity === "block"), findings, checkedAt: new Date().toISOString() };
}
