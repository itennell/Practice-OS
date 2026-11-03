// A chat's title is her first message, cut short. It shows in the menu on every
// page, so it gets a stricter check than the message itself: anything the crisis
// check or the sensitive-info guard would refuse (now, or with look-alike digits
// read as letters: "cl1ent S4rah") becomes a neutral "New chat". Saved titles are
// checked again when they are read, so an older title the guard would now refuse
// never reaches the screen.
import { checkCrisis } from "../safety";
import { guard, type GuardResult } from "./guard";

export const NEUTRAL_TITLE = "New chat";
const TITLE_CHARS = 60;

export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= TITLE_CHARS ? clean : `${clean.slice(0, TITLE_CHARS - 1).trimEnd()}…`;
}

// Digits written for letters, only when they touch a letter ("K1ein", not "60614").
const DIGIT_AS = (one: string): Record<string, string> => ({ "0": "o", "1": one, "3": "e", "4": "a", "5": "s", "7": "t", "8": "b" });
function foldDigits(text: string, one: string): string {
  const map = DIGIT_AS(one);
  return text.replace(/(?<=\p{L})[0134578]+|[0134578]+(?=\p{L})/gu, (m) => [...m].map((d) => map[d] ?? d).join(""));
}

/** Every reading of the text the checks see: as written and with digits read as letters. */
function readings(text: string): string[] {
  return [...new Set([text, foldDigits(text, "i"), foldDigits(text, "l")])];
}

export type TitleCheck = (text: string) => Promise<GuardResult>;
const guardMessage: TitleCheck = (text) => guard(text, "message");

/** The title to save or show for this text, or "New chat" when any check refuses it (or can't run). */
export async function safeTitle(text: string, check: TitleCheck = guardMessage): Promise<string> {
  const title = titleFrom(text);
  if (!title || title === NEUTRAL_TITLE) return NEUTRAL_TITLE;
  try {
    for (const t of readings(text.trim().replace(/\s+/g, " "))) {
      if (checkCrisis(t).crisis) return NEUTRAL_TITLE;
      if (!(await check(t)).ok) return NEUTRAL_TITLE;
    }
  } catch {
    return NEUTRAL_TITLE;
  }
  return title;
}

// Titles already checked on read, so the menu doesn't re-run the name-finder on every page.
const checked = new Map<string, string>();
const MAX_CACHED = 500;

/** A saved title as it may be shown: unchanged when it still passes, else "New chat". */
export async function shownTitle(title: string, check: TitleCheck = guardMessage): Promise<string> {
  const hit = checked.get(title);
  if (hit !== undefined) return hit;
  let shown: string;
  let cache = true;
  try {
    shown = await safeTitle(title, async (t) => {
      const r = await check(t);
      if (!r.ok && (r.kind === "unavailable" || r.kind === "too_long")) cache = false; // try again next time
      return r;
    });
  } catch {
    shown = NEUTRAL_TITLE;
    cache = false;
  }
  if (cache) {
    if (checked.size >= MAX_CACHED) checked.delete(checked.keys().next().value as string);
    checked.set(title, shown);
  }
  return shown;
}

/** For tests: forget titles already checked. */
export function forgetCheckedTitles(): void {
  checked.clear();
}
