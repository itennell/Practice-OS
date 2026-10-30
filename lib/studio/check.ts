// Safety for a studio document, the same rules as a post (AGENTS.md > Instagram
// posts): practice logistics only, her never-show list, her real fees, no client
// stories or testimonials, and a self-harm topic is a hard stop that alerts her.
// Plain code first on every word. Then, whenever the words on the slides and
// texts change in any way (new words, a slide moved or taken out), the whole
// joined slide and text run is checked again by the topic gate and Muse's critic,
// since two safe slides can read as advice side by side.
import { codeCritic, museCritic, RULE_TEXT, type ChatFn, type CriticContext } from "../instagram/critic";
import { neverShowHits } from "../instagram/never-show";
import { gateTopic } from "../instagram/topic-gate";
import { checkCrisis } from "../safety";
import { docWords, type StudioDoc } from "./doc";

export type Limits = { ctx: CriticContext; neverShow: string[] };

/**
 * Plain-code problems with one piece of slide, title, cue or video text. A price
 * must be one of her real fees (invented_fee); the license line belongs to the caption.
 */
export function textProblems(text: string, limits: { neverShow: string[]; ctx?: Pick<CriticContext, "feesCents"> }): string[] {
  const t = text.trim();
  if (!t) return [];
  const found = codeCritic(t, { licenseLine: "", feesCents: limits.ctx?.feesCents ?? [] })
    .findings.filter((f) => !["license_line", "caption_limits"].includes(f.rule))
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

/**
 * What she asked the new picture to show ("swap the picture: a sunny office"), before
 * it reaches the image prompt: the same plain-code rules as slide text, the topic gate,
 * and her whole never-show list (a picture can show anything on it, not only a face).
 */
export function pictureIdeaProblems(idea: string, limits: Limits): { hardStop: boolean; problems: string[] } {
  const t = idea.trim();
  if (!t) return { hardStop: false, problems: [] };
  if (checkCrisis(t).crisis) return { hardStop: true, problems: [RULE_TEXT.self_harm] };
  const found = textProblems(t, limits);
  if (limits.neverShow.length && neverShowHits(t, limits.neverShow).length && !found.includes(RULE_TEXT.never_show)) found.push(RULE_TEXT.never_show);
  return { hardStop: found.includes(RULE_TEXT.self_harm), problems: found };
}

/** Words in `next` that weren't in `before`. */
export function changedWords(before: StudioDoc | null, next: StudioDoc): string[] {
  const old = new Set(before ? docWords(before) : []);
  return docWords(next).filter((w) => !old.has(w));
}

/** The slide and on-video words in the order she sees them, as one run of text. */
export function joinedText(doc: StudioDoc): string {
  return [doc.title, ...doc.slides.map((s) => s.text), ...[...doc.overlays].sort((a, b) => a.start - b.start).map((o) => o.text)]
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
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

const fail = (problems: string[]): DocCheck => {
  const list = [...new Set(problems)];
  if (list.includes(RULE_TEXT.self_harm)) return { ok: false, hardStop: true, why: RULE_TEXT.self_harm, problems: [RULE_TEXT.self_harm] };
  return { ok: false, hardStop: false, why: list[0], problems: list };
};

/**
 * Checks a step. `before` null means a whole new document (every word is new). Self-harm
 * wins over everything and is never saved. Muse reads the new words and, when the joined
 * slide and text run changed at all, that whole run.
 */
export async function checkStep(before: StudioDoc | null, next: StudioDoc, limits: Limits, opts: { chat?: ChatFn; muse?: boolean } = {}): Promise<DocCheck> {
  const changed = changedWords(before, next);
  const joined = joinedText(next);
  const joinedChanged = !before || joinedText(before) !== joined;
  const captionChanged = before?.caption !== next.caption;
  // The captions' whole run as one transcript: a crisis phrase split across two
  // caption pieces reads safe in each piece alone.
  const transcript = next.captions.cues.map((c) => c.text).join(" ");
  const transcriptChanged = !before || before.captions.cues.map((c) => c.text).join(" ") !== transcript;
  if (!changed.length && !joinedChanged && !captionChanged && !transcriptChanged) return { ok: true };
  if ([...changed, joined].some((w) => checkCrisis(w).crisis) || (transcriptChanged && !!transcript && checkCrisis(transcript).crisis)) return fail([RULE_TEXT.self_harm]);
  const problems: string[] = [];
  for (const w of changed) {
    if (w === next.caption) continue;
    problems.push(...textProblems(w, limits));
  }
  // Two slides that each pass can still read as advice together ("How to cope" + "with anxiety").
  if (joinedChanged && joined) {
    const gate = gateTopic(joined.replace(/\s*\n\s*/g, " "));
    if (!gate.ok) problems.push(gate.hardStop ? RULE_TEXT.self_harm : gate.why);
  }
  if (captionChanged) problems.push(...captionProblems(next.caption, limits));
  if (problems.length) return fail(problems);
  if (opts.muse === false) return { ok: true };
  const forMuse = [...new Set([...changed.filter((w) => w !== next.caption && !joined.includes(w)), ...(joinedChanged && joined ? [joined] : []), ...(captionChanged && next.caption.trim() ? [next.caption] : [])])];
  if (!forMuse.length) return { ok: true };
  const findings = await critic(forMuse.join("\n\n"), opts.chat);
  if (!findings.length) return { ok: true };
  return fail(findings.map((f) => (f.rule === "self_harm" ? RULE_TEXT.self_harm : f.message)));
}
