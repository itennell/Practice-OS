// The safety check every Instagram draft passes before Dana sees it
// (AGENTS.md > Instagram posts: practice logistics only). Plain code decides
// first; then Muse Spark reads the draft and may only ADD a block, never lift
// one. Rules come from APA 5.05, NASW 4.07(b) and ACA C.3.b (no testimonials or
// client stories), NASW 4.06(c) (accurate credentials) and safe-messaging
// guidance (no method details; suicide or self-harm topics are not posted).
import { chat as metaChat, type ChatParams } from "../meta";
import { checkCrisis } from "../safety";
import { captionProblems } from "./graph";

export type CriticRule =
  | "self_harm"
  | "client_story"
  | "testimonial"
  | "outcome_promise"
  | "method_detail"
  | "advice"
  | "license_line"
  | "invented_fee"
  | "caption_limits"
  | "never_show";

export type Finding = { rule: CriticRule; by: "code" | "muse"; message: string };

export type CriticResult = {
  ok: boolean;
  /** Suicide or self-harm: blocked with no rewrite. */
  hardStop: boolean;
  findings: Finding[];
};

export type CriticContext = { licenseLine: string; feesCents: number[] };

/** Her words, shown on the blocked card. */
export const RULE_TEXT: Record<CriticRule, string> = {
  self_harm: "Posts never touch suicide or self-harm. If someone is in danger: call or text 988, or 911 in an emergency.",
  client_story: "Posts can't tell a client's story, even with details changed. That protects your clients and your license.",
  testimonial: "Posts can't include or ask for testimonials or reviews.",
  outcome_promise: "Posts can't promise results.",
  method_detail: "Posts stay on logistics, so they don't explain therapy methods or exercises.",
  advice: "Posts stay on logistics, so they don't give mental health advice.",
  license_line: "Every post ends with your exact license line.",
  invented_fee: "A price in the post doesn't match your fee list.",
  caption_limits: "The caption is over one of Instagram's limits.",
  never_show: "It shows something you said posts never show.",
};

const b = (s: string) => new RegExp(`\\b(?:${s})\\b`, "i");

// Each rule: phrases that trigger it. Word boundaries, case-insensitive, run on
// the text with curly quotes straightened.
const PATTERNS: Partial<Record<CriticRule, RegExp[]>> = {
  client_story: [
    b("(a|one of my|my|our) (former |past |current |recent )?(clients?|patients?)( of (mine|ours))? (who|that|was|is|had|came|told|said|shared|started|went|finally|recently|once)"),
    b("a client of (mine|ours)"),
    b("(one|many|some|several|two|three) of my (clients|patients)"),
    b("(i|we) (once )?(worked|work|met|helped|saw|see) with (a|one) (client|patient|young|woman|man|teen|mom|dad|couple|family)"),
    b("(her|his|their) (first|last|next) session with me"),
    b("(case study|true story|real story|client story|success story)"),
    b("names? (and|&) (details|identifying details) (have been |were )?changed"),
  ],
  testimonial: [
    b("testimonials?|five[- ]star|5[- ]star|rate us|google reviews?|yelp reviews?"),
    b("(what|hear what) (my |our )?(clients|patients) (say|are saying)"),
    b("(clients|patients) (say|said|love|rave)"),
    b("(leave|write|share) (us |me )?(a )?(review|testimonial|kind words)"),
    /[“"][^”"]{10,}[”"]\s*[-—–]\s*[A-Z]/,
  ],
  outcome_promise: [
    b("guarantee[ds]?|cured?|cures|fix (your|you)|100% (better|success)|proven to|results in \\d+|in just \\d+ (sessions|weeks|days)"),
    b("you('ll| will) (feel|be|get) (better|happier|healed|calmer|less anxious|fixed)"),
    b("(get rid of|eliminate|end) (your )?(anxiety|depression|trauma|panic|stress)"),
    b("(life[- ]changing|transform your life|never feel)"),
  ],
  method_detail: [
    b("(tip|technique|exercise|worksheet|homework|protocol) ?(#|no\\.? ?)?\\d"),
    b("(try|practice) (this|these) (exercise|technique|breathing|grounding)"),
    b("(box|4-7-8|deep) breathing|grounding (exercise|technique)|5-4-3-2-1|thought record|exposure hierarchy|bilateral stimulation|tapping"),
    b("(cbt|dbt|emdr|act|ifs) (techniques?|skills?|exercises?|protocol|steps?|worksheets?)"),
  ],
  advice: [
    b("(signs|symptoms) (of|that) (you|your)"),
    b("(you should|you need to|try to) (stop|start|avoid|let go|journal|meditate|breathe|set boundaries)"),
    b("(how to|ways to) (cope|manage|deal with|overcome|heal|beat|stop) (with )?(your )?(anxiety|depression|grief|trauma|panic|stress|anger|sadness|feelings)"),
    b("(are you|you might be) (depressed|anxious|traumatized|bipolar)"),
    b("self[- ]care tips?|coping (skills|strategies|tips)"),
  ],
};

const straighten = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

/** Dollar amounts in the text, in cents. */
function dollarAmounts(text: string): number[] {
  return [...text.matchAll(/\$\s?(\d{1,4}(?:,\d{3})*)(?:\.(\d{2}))?/g)].map((m) => Number(m[1].replace(/,/g, "")) * 100 + Number(m[2] ?? 0));
}

/** Plain code: every rule that can be checked without a model. */
export function codeCritic(text: string, ctx: CriticContext): CriticResult {
  const findings: Finding[] = [];
  const clean = straighten(text);
  if (checkCrisis(clean).crisis) findings.push({ rule: "self_harm", by: "code", message: RULE_TEXT.self_harm });
  for (const [rule, patterns] of Object.entries(PATTERNS) as [CriticRule, RegExp[]][]) {
    if (patterns.some((p) => p.test(clean))) findings.push({ rule, by: "code", message: RULE_TEXT[rule] });
  }
  if (!text.includes(ctx.licenseLine)) findings.push({ rule: "license_line", by: "code", message: RULE_TEXT.license_line });
  const invented = dollarAmounts(clean).filter((c) => !ctx.feesCents.includes(c));
  if (invented.length) findings.push({ rule: "invented_fee", by: "code", message: RULE_TEXT.invented_fee });
  for (const p of captionProblems(text)) findings.push({ rule: "caption_limits", by: "code", message: p });
  return finish(findings);
}

function finish(findings: Finding[]): CriticResult {
  const hardStop = findings.some((f) => f.rule === "self_harm");
  return { ok: findings.length === 0, hardStop, findings };
}

// ---- Muse check -----------------------------------------------------------------
// Cookbook: 01_api_fundamentals/04_structured_output.ipynb (response_format json_schema).

export type ChatFn = (feature: string, params: ChatParams) => ReturnType<typeof metaChat>;

const MUSE_RULES: CriticRule[] = ["self_harm", "client_story", "testimonial", "outcome_promise", "method_detail", "advice"];

const VERDICT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["breaks"],
  properties: {
    breaks: {
      type: "array",
      description: "Every rule the post breaks. Empty when it is pure practice logistics.",
      items: { type: "string", enum: MUSE_RULES },
    },
  },
} as const;

const SYSTEM = `You check Instagram captions for a licensed therapist's private practice. Posts may only cover practice logistics: what a first session is like, fees and superbills, how to book, who the clinician is, the office and telehealth.
Report every rule the caption breaks:
- self_harm: mentions suicide, self-harm or wanting to die, in any wording.
- client_story: describes or hints at any real or composite client or patient, even anonymized.
- testimonial: quotes, asks for or describes reviews, ratings or praise from clients.
- outcome_promise: promises or implies results from therapy.
- method_detail: explains a therapy technique, exercise, protocol or homework.
- advice: gives mental health advice, symptom checklists or coping tips.
Logistics about how sessions work, prices, insurance, booking, location and the clinician's background break nothing. Reply with JSON only.`;

/** Muse reads the draft. It can only add findings, so a model mistake never unblocks a post. */
export async function museCritic(text: string, callModel: ChatFn = metaChat): Promise<Finding[]> {
  const res = await callModel("instagram.critic", {
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Caption:\n"""\n${text}\n"""` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "caption_check", schema: VERDICT_SCHEMA as never } },
  });
  let breaks: unknown;
  try {
    breaks = (JSON.parse(res.choices[0]?.message.content ?? "{}") as { breaks?: unknown }).breaks;
  } catch {
    throw new Error("The safety check didn't answer clearly, so the post was held back.");
  }
  if (!Array.isArray(breaks)) throw new Error("The safety check didn't answer clearly, so the post was held back.");
  return [...new Set(breaks.filter((r): r is CriticRule => MUSE_RULES.includes(r as CriticRule)))].map((rule) => ({
    rule,
    by: "muse" as const,
    message: RULE_TEXT[rule],
  }));
}

/** Code first, then Muse; a code hard stop skips the model entirely. */
export async function critique(text: string, ctx: CriticContext, opts: { chat?: ChatFn } = {}): Promise<CriticResult> {
  const code = codeCritic(text, ctx);
  if (code.hardStop) return code;
  const muse = await museCritic(text, opts.chat);
  const known = new Set(code.findings.map((f) => f.rule));
  return finish([...code.findings, ...muse.filter((f) => !known.has(f.rule))]);
}
