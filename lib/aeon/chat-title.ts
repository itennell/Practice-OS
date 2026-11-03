// A chat's title is her first message, cut short. It shows in the menu on every
// page, so it gets a stricter check than the message itself.
//
// - On save (safeTitle): the crisis check, the plain-code rules and the full
//   sensitive-info guard (name-finder included) read the text as written and with
//   look-alikes read as letters ("cl1ent S4rah", "S.a.r.a.h", "m@ri$"). Anything
//   refused, or any check that can't run, saves the title as "New chat". The
//   verdict is the stored title itself, so no column is needed.
// - On read (shownTitle): plain code only (crisis check + rules), no name-finder
//   and no network, so the menu stays fast. An older title saved before this
//   check, that the rules refuse now, shows as "New chat".
import { createHash } from "node:crypto";
import { checkCrisis } from "../safety";
import { guard, type GuardResult } from "./guard";
import { checkIdentity, type Allowlist } from "./identity-filter";
import { withoutContext } from "../referrals/ask-context";

export const NEUTRAL_TITLE = "New chat";
const TITLE_CHARS = 60;
/** The most text the read-time check looks at: saved titles are 60 characters. */
const READ_CHARS = 120;
const NO_ONE: Allowlist = { names: [], contacts: [] };

export function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= TITLE_CHARS ? clean : `${clean.slice(0, TITLE_CHARS - 1).trimEnd()}…`;
}

// Digits and symbols written for letters, only where they touch a letter ("K1ein", "m@ria", not "60614").
const AS_LETTER = (one: string): Record<string, string> => ({
  "0": "o", "1": one, "2": "z", "3": "e", "4": "a", "5": "s", "6": "g", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": one,
});
const TOUCHING = /(?<=\p{L})[0-9@$!]+|[0-9@$!]+(?=\p{L})/gu;
function foldLookalikes(text: string, one: string): string {
  const map = AS_LETTER(one);
  return text.replace(TOUCHING, (m) => [...m].map((c) => map[c] ?? c).join(""));
}

// Single letters strung together with separators ("S.a.r.a.h", "K-l-e-i-n", "S a r a h") become one word.
// Marks first, then plain spaces, so "S.a.r.a.h K-l-e-i-n" stays two words.
const MARKED = /(?<![\p{L}\p{N}])\p{L}(?:[.\-_*·•|/\\]+\p{L}(?![\p{L}\p{N}])){2,}/gu;
const SPACED = /(?<![\p{L}\p{N}])\p{L}(?: +\p{L}(?![\p{L}\p{N}])){2,}/gu;
function joinSpaced(text: string): string {
  const join = (m: string) => m.replace(/[^\p{L}]+/gu, "");
  return text.replace(MARKED, join).replace(SPACED, join);
}

/** Every reading of the text the checks see. */
export function titleReadings(text: string): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  const out = new Set<string>();
  for (const t of [clean, foldLookalikes(clean, "i"), foldLookalikes(clean, "l")]) {
    out.add(t);
    out.add(joinSpaced(t));
  }
  return [...out];
}

/** Plain code only: the crisis check and the guard's rules, on every reading. */
export function plainRefuses(text: string): boolean {
  return titleReadings(text.slice(0, READ_CHARS)).some((t) => checkCrisis(t).crisis || !checkIdentity(t, NO_ONE).ok);
}

export type TitleCheck = (text: string) => Promise<GuardResult>;
const guardMessage: TitleCheck = (text) => guard(text, "message");

/** The title to save for her first message: "New chat" when any check refuses it or can't run. */
export async function safeTitle(text: string, check: TitleCheck = guardMessage): Promise<string> {
  const title = titleFrom(text);
  if (!title || title === NEUTRAL_TITLE) return NEUTRAL_TITLE;
  try {
    if (plainRefuses(text)) return NEUTRAL_TITLE;
    for (const t of titleReadings(text)) {
      if (!(await check(t)).ok) return NEUTRAL_TITLE;
    }
  } catch {
    return NEUTRAL_TITLE;
  }
  return title;
}

// Read-time verdicts, keyed by a hash of the title (never the text itself), kept for a minute.
const TTL_MS = 60_000;
const MAX_CACHED = 500;
const checked = new Map<string, { shown: string; at: number }>();

/** A saved title as it may be shown: unchanged when it still passes the plain-code checks, else "New chat". */
export function shownTitle(saved: string, now = Date.now()): string {
  // A chat saved before the Ask Aeon context became its own field has it in its title, maybe cut
  // short at 60 characters ("… (Asked from Refer…").
  const title = withoutContext(saved).replace(/\s*\(Asked from\b[^)]*\)?…?$/, "").trim() || NEUTRAL_TITLE;
  const key = createHash("sha256").update(title).digest("hex");
  const hit = checked.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.shown;
  let shown: string;
  try {
    shown = plainRefuses(title) ? NEUTRAL_TITLE : title;
  } catch {
    shown = NEUTRAL_TITLE;
  }
  checked.delete(key);
  if (checked.size >= MAX_CACHED) checked.delete(checked.keys().next().value as string);
  checked.set(key, { shown, at: now });
  return shown;
}

/** For tests: forget titles already checked. */
export function forgetCheckedTitles(): void {
  checked.clear();
}
