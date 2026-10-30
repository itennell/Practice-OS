// Safety for a studio document, the same rules as a post (AGENTS.md > Instagram
// posts): practice logistics only, her never-show list, no client stories or
// testimonials, and a self-harm topic is a hard stop that alerts her. Plain code
// first on every word; Muse's critic reads only words that changed in this
// step, since earlier ones already passed it.
import { codeCritic, museCritic, RULE_TEXT, type ChatFn, type CriticContext } from "../instagram/critic";
import { neverShowHits } from "../instagram/never-show";
import { gateTopic } from "../instagram/topic-gate";
import { checkCrisis } from "../safety";
import { docWords, type StudioDoc } from "./doc";

export type Limits = { ctx: CriticContext; neverShow: string[] };

/** Plain-code problems with one piece of slide, title or video text. */
export function textProblems(text: string, limits: Pick<Limits, "neverShow">): string[] {
  const t = text.trim();
  if (!t) return [];
  const found = codeCritic(t, { licenseLine: "", feesCents: [] })
    .findings.filter((f) => !["license_line", "invented_fee", "caption_limits"].includes(f.rule))
    .map((f) => f.message);
  const gate = gateTopic(t);
  if (!gate.ok) found.push(gate.hardStop ? RULE_TEXT.self_harm : gate.why);
  if (limits.neverShow.length && neverShowHits(t, limits.neverShow, { only: ["face", "family"] }).length) found.push(RULE_TEXT.never_show);
  return [...new Set(found)];
}

/** Plain-code problems with the caption: the post rules, with her license line and fee list. */
export function captionProblems(caption: string, limits: Limits): string[] {
  if (!caption.trim()) return [];
  const found = codeCritic(caption, limits.ctx).findings.map((f) => f.message);
  if (limits.neverShow.length && neverShowHits(caption, limits.neverShow, { only: ["face", "family"] }).length) found.push(RULE_TEXT.never_show);
  return [...new Set(found)];
}

/** Words in `next` that weren't in `before`. */
export function changedWords(before: StudioDoc | null, next: StudioDoc): string[] {
  const old = new Set(before ? docWords(before) : []);
  return docWords(next).filter((w) => !old.has(w));
}

export type DocCheck = { ok: true } | { ok: false; hardStop: boolean; why: string; problems: string[] };

/** Tests only (PLAYWRIGHT_CRITIC_STANDIN=1): the Muse check finds nothing. Refused on Vercel. */
async function critic(text: string, callModel?: ChatFn) {
  if (process.env.PLAYWRIGHT_CRITIC_STANDIN === "1") {
    if (process.env.VERCEL) throw new Error("PLAYWRIGHT_CRITIC_STANDIN is for tests only.");
    return [];
  }
  return museCritic(text, callModel);
}

/** Checks what a step changed. Self-harm wins over everything and is never saved. */
export async function checkStep(before: StudioDoc | null, next: StudioDoc, limits: Limits, opts: { chat?: ChatFn; muse?: boolean } = {}): Promise<DocCheck> {
  const changed = changedWords(before, next);
  if (!changed.length && before?.caption === next.caption) return { ok: true };
  if (changed.some((w) => checkCrisis(w).crisis)) return { ok: false, hardStop: true, why: RULE_TEXT.self_harm, problems: [RULE_TEXT.self_harm] };
  const problems: string[] = [];
  for (const w of changed) {
    if (w === next.caption) continue;
    for (const p of textProblems(w, limits)) problems.push(p);
  }
  if (before?.caption !== next.caption) problems.push(...captionProblems(next.caption, limits));
  if (problems.some((p) => p === RULE_TEXT.self_harm)) return { ok: false, hardStop: true, why: RULE_TEXT.self_harm, problems: [RULE_TEXT.self_harm] };
  if (problems.length) return { ok: false, hardStop: false, why: [...new Set(problems)][0], problems: [...new Set(problems)] };
  if (opts.muse === false) return { ok: true };
  const words = changed.join("\n");
  if (!words) return { ok: true };
  const findings = await critic(words, opts.chat);
  if (!findings.length) return { ok: true };
  const hardStop = findings.some((f) => f.rule === "self_harm");
  return { ok: false, hardStop, why: hardStop ? RULE_TEXT.self_harm : findings[0].message, problems: findings.map((f) => f.message) };
}
