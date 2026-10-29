// What she typed in the Instagram box, checked in plain code before anything
// is written (AGENTS.md > Instagram posts: practice logistics only). An advice
// topic ("how to work through anxiety") is never switched silently to another
// post: she is told why, and offered the nearest logistics angle to pick.
import { codeCritic, RULE_TEXT, type CriticRule } from "./critic";
import type { PillarId } from "./pillars";

export type Angle = { label: string; pillar: PillarId };

export type TopicGate =
  | { ok: true }
  | { ok: false; hardStop: true; rule: "self_harm"; why: string }
  | { ok: false; hardStop: false; rule: CriticRule; why: string; angle: Angle };

// Things people come to therapy about, as she might type them, mapped to the
// words used in the offered angle.
const SUBJECTS: [RegExp, string][] = [
  [/\banxi(ety|ous)\b|\bpanic\b|\bworr(y|ying|ies)\b/i, "anxiety"],
  [/\bdepress(ion|ed)\b|\blow mood\b/i, "depression"],
  [/\bgrie(f|ving)\b|\bloss\b|\bbereave/i, "grief"],
  [/\btrauma\b|\bptsd\b/i, "trauma"],
  [/\bstress(ed)?\b|\bburn ?out\b/i, "stress"],
  [/\banger\b/i, "anger"],
  [/\bcouples?\b|\brelationships?\b|\bmarriage\b/i, "couples"],
  [/\bteens?\b|\bteenagers?\b|\badolescen/i, "teens"],
  [/\bparent(s|ing)\b/i, "parents"],
  [/\bsleep\b|\binsomnia\b/i, "sleep"],
  [/\bself[- ]esteem\b|\bconfidence\b/i, "self-esteem"],
];

// "How do I / ways to / tips for … work through / cope with / get over …": asking
// for help with a feeling, not about how the practice works.
const HELP_VERB = String.raw`(work(ing)? through|get(ting)? (through|over|past|rid of)|cop(e|ing)|manag(e|ing)|deal(ing)? with|handl(e|ing)|overcom(e|ing)|heal(ing)?|beat(ing)?|stop(ping)?|calm(ing)?( down)?|reduc(e|ing)|eas(e|ing)|fix(ing)?|feel(ing)? better|improv(e|ing)|live with|recover from)`;
const ASKING_HELP = new RegExp(
  String.raw`\b((how|ways|tips|steps|strategies|tools|things you can do) (to|for|on|i can|you can|do i|do you|can i|can you)|help (with|for)|what to do (about|when|if))\b.*\b${HELP_VERB}\b|\b${HELP_VERB} (your |my |with |the )?(anxi|depress|grie|trauma|panic|stress|anger|sad|feelings|emotions|thoughts|worr|insomnia|sleep)`,
  "i",
);
const WHEN_YOU_FEEL = /\b(when|if) (you|i|we|they)('re| are|'m| am| feel| get| start to feel)( so| really| very)? (anxious|sad|depressed|overwhelmed|stressed|lonely|angry|hopeless|panick|numb|stuck|burn)/i;
const TIPS_ABOUT = /\b(tips|advice|exercises?|techniques?|hacks?|tricks?)\b.*\b(anxi|depress|grie|trauma|panic|stress|anger|feelings|emotions|sleep|self[- ]esteem)/i;

/** The subject of her request, if it names one ("anxiety"). */
export function subjectOf(request: string): string | null {
  return SUBJECTS.find(([re]) => re.test(request))?.[1] ?? null;
}

/** The nearest logistics post to an advice request. */
export function nearestAngle(request: string): Angle {
  const s = subjectOf(request);
  return s ? { label: `What a first session for ${s} looks like`, pillar: "first_session" } : { label: "What your first session looks like", pillar: "first_session" };
}

const OFFER: Partial<Record<CriticRule, (subject: string | null) => string>> = {
  advice: (s) => `Posts stay on how your practice works, so Aeon can't write advice${s ? ` about ${s}` : ""}.`,
  method_detail: () => "Posts stay on how your practice works, so Aeon can't explain therapy techniques or exercises.",
  outcome_promise: () => "Posts can't promise results, so Aeon can't write that one as asked.",
  client_story: () => "Posts can't tell a client's story, even with details changed, so Aeon can't write that one.",
  testimonial: () => "Posts can't include or ask for testimonials or reviews, so Aeon can't write that one.",
};

/** Checks her request. A self-harm topic is a hard stop with the fixed crisis line. */
export function gateTopic(request: string): TopicGate {
  const found = codeCritic(request, { licenseLine: "", feesCents: [] }).findings.map((f) => f.rule);
  if (found.includes("self_harm")) return { ok: false, hardStop: true, rule: "self_harm", why: RULE_TEXT.self_harm };
  const advice = ASKING_HELP.test(request) || TIPS_ABOUT.test(request) || WHEN_YOU_FEEL.test(request);
  const rule = (["client_story", "testimonial", "outcome_promise", "method_detail", "advice"] as CriticRule[]).find(
    (r) => found.includes(r) || (r === "advice" && advice),
  );
  if (!rule) return { ok: true };
  const subject = subjectOf(request);
  return { ok: false, hardStop: false, rule, why: OFFER[rule]!(subject), angle: nearestAngle(request) };
}
