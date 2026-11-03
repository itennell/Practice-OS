// The sensitive-info guard. One call at every point where text could reach the
// model or the database: her message, each tool result, each memory written and
// Aeon's reply. Layer 1 is plain-code rules (identity-filter.ts), layer 2 the
// local name-finder (phi-classifier.ts). Nothing is sent anywhere to be checked.
// It fails closed: if the name-finder can't load, the text is refused.
import { db } from "../db";
import {
  MY_CLIENT,
  checkIdentity,
  clientLike,
  clinicalForMemory,
  colleagueAt,
  foldTypos,
  mentionsDiagnosis,
  namedCondition,
  ownContext,
  personalDetail,
  referralContext,
  sentenceAt,
  sentenceSpans,
  type Allowlist,
  type PhiKind,
} from "./identity-filter";
import { findNames, isNameLike } from "./phi-classifier";

export type GuardPoint = "message" | "tool_result" | "memory" | "reply";
export type GuardKind = PhiKind | "unavailable" | "too_long";
export type GuardResult = { ok: true; text: string } | { ok: false; kind: GuardKind };

/** The fixed line she sees when her message is refused. Never repeats what she typed. */
export const REFUSAL: Record<GuardKind, string> = {
  client_name:
    "That looks like a person's name, and I can't keep client details yet. If it's a colleague or referral source, add them on Referrals first. Otherwise, ask again without the name.",
  birth_date: "That looks like a birth date, and I can't keep client details yet. Ask again without it.",
  diagnosis: "That looks like a diagnosis about a person, and I can't keep clinical details. Ask again without it.",
  identifier: "That looks like an ID number (SSN, member or record number). I can't keep those. Ask again without it.",
  contact: "That looks like someone's email or phone number. I can't keep client contact details yet. Ask again without it.",
  address: "That looks like someone's home address. I can't keep client details yet. Ask again without it.",
  identifying:
    "That describes one client closely enough to pick them out (an age, a job, a place or a health detail). I can't keep client details yet. Ask again without those details.",
  unavailable: "My privacy check isn't working right now, so I can't read messages. Try again in a minute.",
  too_long: "That's too long for my privacy check to read in full, so I left its text out. Ask about a shorter part, or open it on the Files page.",
};

/** What a model sees in place of a tool result the rules refused. */
export const WITHHELD = "[withheld: this result may contain a client detail]";
const NAME_WITHHELD = "[name withheld]";
/** What stands in Aeon's reply for one line or card the guard left out. */
export const PART_LEFT_OUT = "[left out: this part may hold a client detail]";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, as-written match: never a piece of a longer word ("dr" in "address"). */
function wholeWord(name: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, `${flags}u`);
}

// Titles, credentials and sample labels are not part of a name when names are
// compared ("Dr. Carin Gordon, LCSW" is "carin gordon", "[Sample] Rev. Tobias
// Wren" is "tobias wren", "Brittany Keiser, MS, CGC" is "brittany keiser").
const TITLE_WORDS = new Set(
  (
    "dr doctor mr mrs ms mx miss prof professor rev reverend fr pastor chaplain md do phd psyd edd dnp lcsw licsw lsw msw lcpc lpc lpcc lmhc lmft mft " +
    "np fnp pmhnp aprn rn bsn msn pa-c cgc msgc ma cns bcc mdiv sample test"
  ).split(" "),
);

const wordsOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]s?$/u, "")
    .split(/[\s.,]+/)
    .map((w) => w.replace(/^[[(]+|[\])]+$/g, ""))
    .filter((w) => w && !TITLE_WORDS.has(w));

/** Every word of the name is in one entry ("Dana" in "Dana Reyes"). */
function partOf(words: string[], list: string[]): boolean {
  return words.length > 0 && list.some((n) => {
    const known = wordsOf(n);
    return words.every((w) => known.includes(w));
  });
}

/** The name is a whole entry, in any case ("Carin Gordon", "carin gordon"), never a piece of one. */
function wholeOf(words: string[], list: string[]): boolean {
  return list.some((n) => {
    const known = wordsOf(n);
    return known.length === words.length && known.every((w) => words.includes(w));
  });
}

const TITLE_BEFORE = /\b(?:Dr|Doctor)\.?\s+$/i;

export type PersonVerdict = { verdict: "ok" } | { verdict: "blank" } | { verdict: "refuse"; kind: PhiKind };

/**
 * How one name found in the text is treated, judged in the sentence around
 * EVERY place it appears. Default refuse: a name passes only when
 *  - it is her whole own name (profile or practice) and the sentence doesn't
 *    treat her like a client ("Dana Reyes wants Tuesdays after 5"), or a part of
 *    it ("Dana") in a sentence clearly about herself (I/my, her license, fees,
 *    hours, profile, posts);
 *  - it is a provider from her Referrals board in a referral sentence (card,
 *    letter, outreach, office, specialty, NPI): the whole name, or the surname
 *    with "Dr." ("Dr. Gordon's card status", "Gordon on my board");
 *  - she introduces a colleague with role and credential ("my supervisor Jenna
 *    Cho, LCSW") outside any client sentence.
 * A title or credential alone clears no one. "my client" next to any name refuses.
 * Anyone else is a stranger: refused when the sentence looks like a client's
 * (a visit, a bill, a condition), otherwise blanked where blanking is allowed.
 */
export function judgePerson(name: string, text: string, allow: Allowlist): PersonVerdict {
  const words = wordsOf(name);
  // Only titles or a sample label ("Rev.", "[Sample]"): no one is named.
  if (words.length === 0) return { verdict: "ok" };
  const directory = allow.directory ?? [];
  const own = allow.names.filter((n) => !directory.includes(n));
  const ownWhole = wholeOf(words, own);
  const ownPart = partOf(words, own);
  const boardWhole = wholeOf(words, directory);
  const boardPart = partOf(words, directory);
  const spots = [...text.matchAll(wholeWord(name, "gi"))].map((m) => m.index ?? 0);
  let blank = false;
  for (const at of spots.length ? spots : [-1]) {
    const s = at < 0 ? text : sentenceAt(text, at);
    if (MY_CLIENT.test(s)) return { verdict: "refuse", kind: "client_name" };
    const condition = namedCondition(name, s);
    const clean = !clientLike(s, true) && !condition;
    if (clean && ownWhole) continue;
    if (clean && ownPart && ownContext(s)) continue;
    const titled = at >= 0 && TITLE_BEFORE.test(text.slice(Math.max(0, at - 8), at));
    if (clean && (boardWhole || boardPart) && (referralContext(s) || (boardPart && titled))) continue;
    if (at >= 0 && colleagueAt(text, at, name) && !condition) continue;
    if (condition || clientLike(s)) return { verdict: "refuse", kind: mentionsDiagnosis(s) ? "diagnosis" : "client_name" };
    blank = true;
  }
  return blank ? { verdict: "blank" } : { verdict: "ok" };
}

/** A name that passes where it stands (see judgePerson). */
export function isAllowedPerson(name: string, text: string, allow: Allowlist): boolean {
  return judgePerson(name, text, allow).verdict === "ok";
}

/**
 * Blanks each name as a whole word. A one-word name is blanked only where it is
 * capitalized, so "Grace" never takes "grace period" with it; a full name
 * ("Kevin Ortiz") is blanked in any case.
 */
export function blankNames(text: string, names: string[]): string {
  let out = text;
  for (const n of names) {
    const oneWord = !/\s/.test(n.trim());
    out = out.replace(wholeWord(n, "gi"), (m) => (oneWord && !/^\p{Lu}/u.test(m) ? m : NAME_WITHHELD));
  }
  return out;
}

/** Every word capitalized the usual way, same length, so "KEVIN ORTIZ" and "kevin ortiz" read as names. */
export function titleCase(text: string): string {
  return text.replace(/\p{L}[\p{L}'’]*/gu, (w) => {
    const first = w[0].toUpperCase();
    const rest = w.slice(1).toLowerCase();
    return first.length === 1 && rest.length === w.length - 1 ? first + rest : w;
  });
}

// Tool results are the practice's own records and official sources: board phone
// numbers, renewal dates from years ago, rule text that names a disorder. Every
// tool result gets the ID and "client <name>" rules plus personalDetail (birth
// dates, emails, home addresses, a condition someone has); names are judged
// below. Tools that return free text she or a client wrote get every rule (fullRules).
const TOOL_RESULT_RULES: readonly PhiKind[] = ["identifier", "client_name"];

// Look-alike letters from other scripts inside a Latin word ("Кevin" with a
// Cyrillic К) are read as the Latin letter. A word wholly in another script
// ("Иван") stays as it is, for the non-Latin name rule.
const LOOKALIKE: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H", О: "O", Р: "P", С: "C", Т: "T", Х: "X", У: "Y", І: "I", Ј: "J", Ѕ: "S",
  а: "a", е: "e", о: "o", р: "p", с: "c", у: "y", х: "x", і: "i", ј: "j", ѕ: "s", ԁ: "d", һ: "h", ӏ: "l",
  Α: "A", Β: "B", Ε: "E", Ζ: "Z", Η: "H", Ι: "I", Κ: "K", Μ: "M", Ν: "N", Ο: "O", Ρ: "P", Τ: "T", Υ: "Y", Χ: "X",
  ο: "o", ν: "v", ι: "i", κ: "k", ρ: "p", τ: "t", υ: "u", χ: "x",
};
const LOOKALIKE_CHARS = new RegExp(`[${Object.keys(LOOKALIKE).join("")}]`, "gu");

function foldLookalikes(text: string): string {
  return text.replace(/[\p{L}]+/gu, (w) => (/\p{Script=Latin}/u.test(w) ? w.replace(LOOKALIKE_CHARS, (c) => LOOKALIKE[c] ?? c) : w));
}

// "K e v i n  O r t i z": four or more single letters with single spaces read as one word,
// split again where a capital follows a small letter ("KevinOrtiz" is "Kevin Ortiz").
function joinSpacedLetters(text: string): string {
  return text.replace(/(?<!\p{L})\p{L}(?:[ \t]+\p{L}(?!\p{L})){3,}/gu, (m) => m.replace(/[ \t]+/g, "").replace(/(\p{Ll})(\p{Lu})/gu, "$1 $2"));
}

/**
 * The text both layers read: look-alike letters folded (NFKC: fullwidth "Ｋｅｖｉｎ"
 * is "Kevin"; Cyrillic "Кevin" is "Kevin"), accents and stray combining marks
 * dropped, invisible characters (zero-width spaces, joiners, direction marks)
 * removed, and spaced-out letters joined, so none of them can split or hide a
 * name. Used for checking only; what is saved is unchanged.
 */
export function normalizeForCheck(text: string): string {
  return foldTypos(joinSpacedLetters(foldLookalikes(text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").normalize("NFKC"))));
}

// Digits and symbols written for letters ("cl1ent S4rah K1ein", "p@tient",
// "k!ll"). "1" and "|" can be i or l, so there are two readings. Only inside a
// word with at least two letters, never a plain number, a time or an ordinal
// ("4pm", "1st", "90837"): those are checked as written.
const LEET: Record<string, [string, string]> = {
  "1": ["i", "l"], "|": ["i", "l"], "!": ["i", "i"], "4": ["a", "a"], "@": ["a", "a"],
  "3": ["e", "e"], "0": ["o", "o"], "5": ["s", "s"], $: ["s", "s"], "7": ["t", "t"],
};
const LEET_CHAR = /[\p{L}013457@$!|]/u;
const LEET_TOKEN = /[\p{L}013457@$!|]+/gu;
const NUMBER_WITH_UNIT = /^\d+(?:st|nd|rd|th|am|pm|s|k|x|yo|mg|ml|mi|hrs?|min|mins|f|m)$/i;

function foldLeetWith(text: string, pick: 0 | 1): string {
  return text.replace(LEET_TOKEN, (t) => {
    if ((t.match(/\p{L}/gu)?.length ?? 0) < 2 || NUMBER_WITH_UNIT.test(t)) return t;
    const chars = [...t];
    return chars
      .map((c, i) => {
        const swap = LEET[c];
        if (!swap) return c;
        const before = i > 0 && LEET_CHAR.test(chars[i - 1]);
        const after = i + 1 < chars.length && LEET_CHAR.test(chars[i + 1]);
        // Inside a word ("S4rah", "k!ll"), or starting one before a letter ("$arah", "5arah").
        return after && (before || /\p{L}/u.test(chars[i + 1])) ? swap[pick] : c;
      })
      .join("");
  });
}

/** The leet readings of text already cleaned by normalizeForCheck that differ from it. */
export function leetVariants(plain: string): string[] {
  const out = new Set<string>();
  for (const pick of [0, 1] as const) {
    const v = foldTypos(foldLeetWith(plain, pick));
    if (v !== plain) out.add(v);
  }
  return [...out];
}

export type GuardOptions = {
  /** A tool result holding free text (notes, memories, approval previews, documents): every rule applies. */
  fullRules?: boolean;
  /**
   * Text too long for the name-finder's second read in full (a long upload) is
   * refused as too_long instead of passing on the first read alone. Set for
   * uploads and free-text tool results.
   */
  failClosedWhenLong?: boolean;
};

export async function guard(text: string, at: GuardPoint, allow?: Allowlist, opts: GuardOptions = {}): Promise<GuardResult> {
  // The allowlist is cleaned the same way, so an allowed "José García" matches "Jose Garcia".
  const raw = allow ?? (await practiceAllowlist());
  const list: Allowlist = {
    names: raw.names.map(normalizeForCheck),
    contacts: raw.contacts.map(normalizeForCheck),
    ...(raw.directory ? { directory: raw.directory.map(normalizeForCheck) } : {}),
  };
  const whole = await checkWithVariants(text, at, list, opts);
  if (whole.ok || at !== "reply" || whole.kind === "unavailable" || whole.kind === "too_long") return whole;
  // One card or line shouldn't blank Aeon's whole answer: leave out only the parts
  // that are refused on their own. Anything less clear-cut refuses the whole reply.
  return (await withoutRefusedParts(text, list, opts)) ?? whole;
}

/** The text as written, then each leet reading of it ("cl1ent S4rah K1ein"). */
async function checkWithVariants(text: string, at: GuardPoint, list: Allowlist, opts: GuardOptions): Promise<GuardResult> {
  const first = await checkOnce(text, at, list, opts);
  if (!first.ok) return first;
  // Public directory and rule text (a light tool result) is read as written.
  if (at === "tool_result" && !opts.fullRules) return first;
  for (const variant of leetVariants(normalizeForCheck(text))) {
    const r = await checkOnce(variant, at, list, opts);
    if (!r.ok) return r;
    // A name that only shows up when the digits are read as letters can't be
    // blanked where it stands, so it is refused.
    if (r.text !== variant) return { ok: false, kind: "client_name" };
  }
  return first;
}

/**
 * Aeon's reply split into lines or cards (or sentences when it is one
 * paragraph). The parts the guard refuses on their own are replaced with
 * PART_LEFT_OUT, and the rest is checked again as a whole. Null (refuse the
 * whole reply) when no single part is at fault, when more than half would go,
 * or when what is left still fails.
 */
async function withoutRefusedParts(text: string, list: Allowlist, opts: GuardOptions): Promise<GuardResult | null> {
  const isContent = (p: string) => p.trim() !== "";
  let parts = text.split(/(\n+)/);
  if (parts.filter(isContent).length < 2) parts = sentenceSpans(text).map(([s, e]) => text.slice(s, e));
  const content = parts.filter(isContent);
  if (content.length < 2) return null;
  const dropped: string[] = [];
  const kept: string[] = [];
  for (const p of parts) {
    if (!isContent(p)) {
      kept.push(p);
      continue;
    }
    const r = await checkWithVariants(p, "reply", list, opts);
    if (r.ok) {
      kept.push(r.text);
      continue;
    }
    if (r.kind === "unavailable" || r.kind === "too_long") return null;
    dropped.push(p);
    // Keep the list marker and spacing, so a numbered plan still reads as one.
    const lead = /^\s*(?:(?:[-*•]|\d+[.)])\s+)?/.exec(p)?.[0] ?? "";
    const trail = /\s*$/.exec(p)?.[0] ?? "";
    kept.push(`${lead}${PART_LEFT_OUT}${trail}`);
  }
  if (dropped.length === 0 || dropped.length * 2 > content.length) return null;
  const rest = kept.join("");
  // A person named in a part that was left out is tied to a client detail there,
  // so their name anywhere else in the reply says too much: hold it all back.
  try {
    const restPlain = normalizeForCheck(rest);
    for (const p of dropped) {
      const plain = normalizeForCheck(p);
      const found = [...(await findNames(plain)), ...(await findNames(titleCase(plain), { secondReads: false }))];
      for (const n of found.filter(isNameLike)) {
        if (wordsOf(n).some((w) => w.length > 1 && wholeWord(w, "i").test(restPlain))) return null;
      }
    }
  } catch {
    return null;
  }
  const again = await checkWithVariants(rest, "reply", list, opts);
  return again.ok ? again : null;
}

async function checkOnce(text: string, at: GuardPoint, list: Allowlist, opts: GuardOptions): Promise<GuardResult> {
  const plain = normalizeForCheck(text);
  const light = at === "tool_result" && !opts.fullRules;
  const rules = light ? checkIdentity(plain, list, TOOL_RESULT_RULES) : checkIdentity(plain, list);
  if (!rules.ok) return { ok: false, kind: rules.kind };
  const detail = light ? personalDetail(plain, list) : null;
  if (detail) return { ok: false, kind: detail };
  // Memory holds practice-business facts only: no clinical content, even with no name.
  if (at === "memory" && clinicalForMemory(plain)) return { ok: false, kind: "diagnosis" };

  let names: string[];
  let cased: string[];
  const titled = titleCase(plain);
  try {
    names = await findNames(plain, { failWhenCapped: opts.failClosedWhenLong || opts.fullRules });
    // A second, cheaper read with every word capitalized: names written in
    // capitals or lowercase ("KEVIN ORTIZ", "carin gordon") are found too.
    cased = titled === plain || titled.length !== plain.length ? [] : await findNames(titled, { secondReads: false });
  } catch (err) {
    if (err instanceof Error && err.name === "TooLongToCheck") return { ok: false, kind: "too_long" };
    console.error(`[guard] name-finder unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, kind: "unavailable" };
  }
  const strangers: string[] = [];
  for (const n of names.filter(isNameLike)) {
    const v = judgePerson(n, plain, list);
    if (v.verdict === "refuse") return { ok: false, kind: v.kind };
    if (v.verdict === "blank") strangers.push(n);
  }
  // A name found only in the capitalized copy is judged as written, the same
  // way. A one-word hit there ("hope", "will") is often an everyday word, so it
  // counts only when its sentence looks like a client's.
  for (const n of cased.filter(isNameLike)) {
    for (const m of titled.matchAll(wholeWord(n, "g"))) {
      const asWritten = plain.slice(m.index ?? 0, (m.index ?? 0) + n.length);
      if (asWritten === n) continue;
      const v = judgePerson(asWritten, plain, list);
      if (v.verdict === "refuse") return { ok: false, kind: v.kind };
      if (v.verdict === "blank" && /\s/.test(n.trim())) strangers.push(asWritten);
    }
  }
  if (strangers.length === 0) return { ok: true, text };
  // A tool result or Aeon's own reply keeps its content with the names blanked
  // out, so one word misread as a name doesn't throw away a whole answer.
  // Anything she typed or Aeon would save is refused outright.
  if (at !== "tool_result" && at !== "reply") return { ok: false, kind: "client_name" };
  const redacted = blankNames(text, strangers);
  // Names are found in the cleaned copy but blanked in the original, so a copy
  // written differently ("Kévin", hidden characters) can survive. Check again:
  // if any stranger is still there, withhold the whole result.
  try {
    const again = normalizeForCheck(redacted);
    if ((await findNames(again)).some((n) => isNameLike(n) && !isAllowedPerson(n, again, list))) return { ok: false, kind: "client_name" };
  } catch {
    return { ok: false, kind: "unavailable" };
  }
  return { ok: true, text: redacted };
}

// ---- the practice's own names and contacts -----------------------------------

let cached: { at: number; list: Allowlist } | null = null;
const CACHE_MS = 60_000;

/** Call after changing names on the list (a Referrals search), so the next check sees them. */
export function forgetAllowlist(): void {
  cached = null;
}

/** From her profile, her credentialing identity and location, and her Referrals list. */
export async function practiceAllowlist(): Promise<Allowlist> {
  if (!process.env.DATABASE_URL) return { names: [], contacts: [] };
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.list;
  const sql = db();
  const [profile] = await sql<{ full_name: string; practice_name: string }[]>`
    select full_name, practice_name from practice_os.clinician_profile limit 1`;
  const [cred] = await sql<{ identity: Record<string, string>; practice_location: Record<string, unknown> }[]>`
    select identity, practice_location from practice_os.credentialing_profile limit 1`.catch(() => []);
  const sources = await sql<{ name: string; organization: string | null; email: string | null; phone: string | null; address: string | null }[]>`
    select name, organization, email, phone, address from practice_os.referral_sources`;

  const location = (cred?.practice_location ?? {}) as { name?: string; phone?: string; address?: { street?: string } };
  const names: (string | null | undefined)[] = [
    profile?.full_name, profile?.practice_name, cred?.identity?.name, cred?.identity?.practiceName, location.name,
    ...sources.flatMap((s) => [s.name, s.organization]),
  ];
  const contacts: (string | null | undefined)[] = [
    cred?.identity?.email, cred?.identity?.phone, location.phone, location.address?.street,
    ...sources.flatMap((s) => [s.email, s.phone, s.address]),
  ];
  const present = (v: string | null | undefined): v is string => Boolean(v);
  const directory = sources.flatMap((s) => [s.name, s.organization]).filter(present);
  cached = { at: Date.now(), list: { names: names.filter(present), contacts: contacts.filter(present), directory } };
  return cached.list;
}
