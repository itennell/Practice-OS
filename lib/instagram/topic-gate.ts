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
  | { ok: false; hardStop: false; rule: CriticRule; why: string; angle: Angle; angles: Angle[] };

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
const HELP_VERB = String.raw`(work(ing)? through|get(ting)? (through|over|past|rid of)|cop(e|ing)|manag(e|ing)|deal(ing)? with|handl(e|ing)|overcom(e|ing)|heal(ing)?|beat(ing)?|stop(ping)?|calm(ing)?( down)?|reduc(e|ing)|eas(e|ing)|fix(ing)?|feel(ing)? better|improv(e|ing)|live with|recover from|avoid(ing)?|prevent(ing)?)`;
const ASKING_HELP = new RegExp(
  String.raw`\b((how|ways|tips|steps|strategies|tools|things you can do) (to|for|on|i can|you can|do i|do you|can i|can you)|help (with|for)|what to do (about|when|if))\b.*\b${HELP_VERB}\b|\b${HELP_VERB} (your |my |with |the )?(anxi|depress|grie|trauma|panic|stress|anger|sad|feelings|emotions|thoughts|worr|insomnia|sleep|burn ?out)`,
  "i",
);
const WHEN_YOU_FEEL = /\b(when|if) (you|i|we|they)('re| are|'m| am| feel| get| start to feel)( so| really| very)? (anxious|sad|depressed|overwhelmed|stressed|lonely|angry|hopeless|panick|numb|stuck|burn)/i;
const FEELINGS = String.raw`(anxi|depress|grie|trauma|panic|stress|anger|sad|feelings|emotions|sleep|insomnia|self[- ]esteem|burn ?out|loneli|worr)`;
const TIPS_ABOUT = new RegExp(String.raw`\b(tips|advice|exercises?|techniques?|hacks?|tricks?)\b.*\b${FEELINGS}`, "i");
// "What helps with anxiety", "what works for grief".
const WHAT_HELPS = new RegExp(String.raw`\bwhat (helps|works|can help|might help)\b.*\b${FEELINGS}`, "i");
// A practice or technique aimed at a feeling: "mindfulness for anxiety".
const TECHNIQUE_FOR = new RegExp(String.raw`\b(mindfulness|meditation|breath(ing|work)|journal(ing)?|grounding|self[- ]care|yoga|affirmations?)\b.*\b${FEELINGS}`, "i");

/** The subject of her request, if it names one ("anxiety"). */
export function subjectOf(request: string): string | null {
  return SUBJECTS.find(([re]) => re.test(request))?.[1] ?? null;
}

/** The nearest logistics post to an advice request. */
export function nearestAngle(request: string): Angle {
  return nearestAngles(request)[0];
}

/** Three logistics posts around her subject, to pick from: what to expect, what it costs, how to book. */
export function nearestAngles(request: string): Angle[] {
  const s = subjectOf(request);
  return s
    ? [
        { label: `What a first session for ${s} looks like`, pillar: "first_session" },
        { label: `What sessions for ${s} cost`, pillar: "fees_superbills" },
        { label: `How to book a first session for ${s}`, pillar: "how_to_book" },
      ]
    : [
        { label: "What your first session looks like", pillar: "first_session" },
        { label: "What a session costs", pillar: "fees_superbills" },
        { label: "How to book your first session", pillar: "how_to_book" },
      ];
}

// Conditions people come to therapy about (not who she sees: couples, teens and parents are fine to name).
const CONDITIONS = new Set(["anxiety", "depression", "grief", "trauma", "stress", "anger", "sleep", "self-esteem"]);
// Words that make it a post about how the practice works around the condition.
const LOGISTICS =
  /\b(first (session|visit|appointment)|sessions?|appointments?|visits?|consults?|consultations?|cost|costs|fees?|prices?|pay(ing|ment)?|superbills?|insurance|in-network|out-of-network|book(ing)?|schedul\w*|telehealth|video|online|office|parking|intake|paperwork|what to (expect|bring)|meet|specializ\w*|i (see|work with|help|treat|offer)|therapy for|counseling for|therapist for|treatment for|waitlist|openings?|hours)\b/i;

/**
 * A bare illness topic ("a post about depression", "depression"): not advice yet, but a post about
 * the illness itself would drift into symptoms or tips. She is told why and offered three logistics
 * angles around it. Null when it isn't one.
 */
export function illnessTopic(request: string): { why: string; angles: Angle[] } | null {
  const s = subjectOf(request);
  if (!s || !CONDITIONS.has(s) || LOGISTICS.test(request)) return null;
  return {
    why: `Posts stay on how your practice works, so Aeon writes about the logistics around ${s}: what a first session is like, what it costs and how to book.`,
    angles: nearestAngles(request),
  };
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
  const advice = [ASKING_HELP, TIPS_ABOUT, WHEN_YOU_FEEL, WHAT_HELPS, TECHNIQUE_FOR].some((re) => re.test(request));
  const rule = (["client_story", "testimonial", "outcome_promise", "method_detail", "advice"] as CriticRule[]).find(
    (r) => found.includes(r) || (r === "advice" && advice),
  );
  if (!rule) return { ok: true };
  const subject = subjectOf(request);
  const angles = nearestAngles(request);
  return { ok: false, hardStop: false, rule, why: OFFER[rule]!(subject), angle: angles[0], angles };
}
