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
  mentionsDiagnosis,
  namedCondition,
  personalDetail,
  referralContext,
  sentenceAt,
  type Allowlist,
  type PhiKind,
} from "./identity-filter";
import { findNames, isNameLike } from "./phi-classifier";

export type GuardPoint = "message" | "tool_result" | "memory" | "reply";
export type GuardKind = PhiKind | "unavailable";
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
  unavailable: "My privacy check isn't working right now, so I can't read messages. Try again in a minute.",
};

/** What a model sees in place of a tool result the rules refused. */
export const WITHHELD = "[withheld: this result may contain a client detail]";
const NAME_WITHHELD = "[name withheld]";

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** A whole-word, as-written match: never a piece of a longer word ("dr" in "address"). */
function wholeWord(name: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, `${flags}u`);
}

const wordsOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/['’]s?$/u, "")
    .split(/[\s.,]+/)
    .filter(Boolean);

/** Every word of the name is in one entry ("Dana" in "Dana Reyes"). */
function partOf(words: string[], list: string[]): boolean {
  return list.some((n) => {
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

export type PersonVerdict = { verdict: "ok" } | { verdict: "blank" } | { verdict: "refuse"; kind: PhiKind };

/**
 * How one name found in the text is treated, judged in the sentence around
 * EVERY place it appears. Default refuse: a name passes only when
 *  - it is her own (her profile or practice; a part such as "Dana" counts) and
 *    the sentence doesn't treat her like a client ("Dana came in for her second
 *    visit", "Dana has anxiety"), or
 *  - it is a whole name from her Referrals board and the sentence is about
 *    referrals: its card, a letter, outreach, the office, specialty or NPI
 *    ("what's the status of Gary Bucher's card").
 * A title or credential clears no one. "my client" next to any name refuses.
 * Anyone else is a stranger: refused when the sentence looks like a client's
 * (a visit, a bill, a condition), otherwise blanked where blanking is allowed.
 */
export function judgePerson(name: string, text: string, allow: Allowlist): PersonVerdict {
  const words = wordsOf(name);
  const directory = allow.directory ?? [];
  const own = allow.names.filter((n) => !directory.includes(n));
  const isOwn = partOf(words, own);
  const isBoard = wholeOf(words, directory);
  const spots = [...text.matchAll(wholeWord(name, "gi"))].map((m) => sentenceAt(text, m.index ?? 0));
  if (spots.length === 0) spots.push(text);
  let blank = false;
  for (const s of spots) {
    if (MY_CLIENT.test(s)) return { verdict: "refuse", kind: "client_name" };
    const condition = namedCondition(name, s);
    if (isOwn && !clientLike(s, true) && !condition) continue;
    if (isBoard && referralContext(s) && !clientLike(s, true) && !condition) continue;
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
// numbers, renewal dates from years ago, rule text that names a disorder. Only
// ID numbers and "client <name>" withhold one; other names are judged below.
// Tools that return free text she or a client wrote get every rule (fullRules).
const TOOL_RESULT_RULES: readonly PhiKind[] = ["identifier", "client_name"];

/**
 * The text both layers read: look-alike letters folded (NFKC: fullwidth "Ｋｅｖｉｎ"
 * is "Kevin"), accents and stray combining marks dropped, and invisible
 * characters (zero-width spaces, joiners, direction marks) removed, so they
 * can't split or hide a name. Used for checking only; what is saved is unchanged.
 */
export function normalizeForCheck(text: string): string {
  return text.normalize("NFKD").replace(/[\p{M}\p{Cf}]/gu, "").normalize("NFKC");
}

export type GuardOptions = {
  /** A tool result holding free text (notes, memories, approval previews, documents): every rule applies. */
  fullRules?: boolean;
};

export async function guard(text: string, at: GuardPoint, allow?: Allowlist, opts: GuardOptions = {}): Promise<GuardResult> {
  // The allowlist is cleaned the same way, so an allowed "José García" matches "Jose Garcia".
  const raw = allow ?? (await practiceAllowlist());
  const list: Allowlist = {
    names: raw.names.map(normalizeForCheck),
    contacts: raw.contacts.map(normalizeForCheck),
    ...(raw.directory ? { directory: raw.directory.map(normalizeForCheck) } : {}),
  };
  const plain = normalizeForCheck(text);
  const light = at === "tool_result" && !opts.fullRules;
  const rules = light ? checkIdentity(plain, list, TOOL_RESULT_RULES) : checkIdentity(plain, list);
  if (!rules.ok) return { ok: false, kind: rules.kind };
  const detail = light ? personalDetail(plain, list) : null;
  if (detail) return { ok: false, kind: detail };

  let names: string[];
  let cased: string[];
  const titled = titleCase(plain);
  try {
    names = await findNames(plain);
    // A second, cheaper read with every word capitalized: names written in
    // capitals or lowercase ("KEVIN ORTIZ", "carin gordon") are found too.
    cased = titled === plain || titled.length !== plain.length ? [] : await findNames(titled, { secondReads: false });
  } catch (err) {
    console.error(`[guard] name-finder unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, kind: "unavailable" };
  }
  const strangers: string[] = [];
  for (const n of names.filter(isNameLike)) {
    const v = judgePerson(n, plain, list);
    if (v.verdict === "refuse") return { ok: false, kind: v.kind };
    if (v.verdict === "blank") strangers.push(n);
  }
  // A name found only in the capitalized copy is judged as written: it refuses
  // when its sentence looks like a client's, and is otherwise left alone.
  for (const n of cased.filter(isNameLike)) {
    for (const m of titled.matchAll(wholeWord(n, "g"))) {
      const asWritten = plain.slice(m.index ?? 0, (m.index ?? 0) + n.length);
      if (asWritten === n) continue;
      const v = judgePerson(asWritten, plain, list);
      if (v.verdict === "refuse") return { ok: false, kind: v.kind };
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
