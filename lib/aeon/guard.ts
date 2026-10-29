// The sensitive-info guard. One call at every point where text could reach the
// model or the database: her message, each tool result, each memory written and
// Aeon's reply. Layer 1 is plain-code rules (identity-filter.ts), layer 2 the
// local name-finder (phi-classifier.ts). Nothing is sent anywhere to be checked.
// It fails closed: if the name-finder can't load, the text is refused.
import { db } from "../db";
import { checkIdentity, type Allowlist, type PhiKind } from "./identity-filter";
import { findNames } from "./phi-classifier";

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

const PROVIDER_BEFORE = /\b(?:Dr\.?|Doctor)\s+$/;
const PROVIDER_AFTER = /^,?\s+(?:LCSW|LICSW|LCPC|LPC|LPCC|LMHC|LMFT|MFT|MD|DO|PhD|PsyD|NP|PMHNP|APRN|RN)\b/;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Her own name, the practice, her Referrals list, or a name written with a provider title. */
export function isAllowedPerson(name: string, text: string, allow: Allowlist): boolean {
  const words = name.toLowerCase().split(/\s+/);
  const known = allow.names.map((n) => n.toLowerCase().split(/[\s,]+/));
  if (known.some((k) => words.every((w) => k.includes(w)))) return true;
  const at = text.search(new RegExp(escape(name), "i"));
  if (at < 0) return false;
  return PROVIDER_BEFORE.test(text.slice(Math.max(0, at - 8), at)) || PROVIDER_AFTER.test(text.slice(at + name.length));
}

// Tool results are the practice's own records and official sources: board phone
// numbers, renewal dates from years ago, rule text that names a disorder. Only
// ID numbers and "client <name>" withhold one; other names are blanked below.
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

export async function guard(text: string, at: GuardPoint, allow?: Allowlist): Promise<GuardResult> {
  // The allowlist is cleaned the same way, so an allowed "José García" matches "Jose Garcia".
  const raw = allow ?? (await practiceAllowlist());
  const list: Allowlist = { names: raw.names.map(normalizeForCheck), contacts: raw.contacts.map(normalizeForCheck) };
  const plain = normalizeForCheck(text);
  const rules = at === "tool_result" ? checkIdentity(plain, list, TOOL_RESULT_RULES) : checkIdentity(plain, list);
  if (!rules.ok) return { ok: false, kind: rules.kind };

  let names: string[];
  try {
    names = await findNames(plain);
  } catch (err) {
    console.error(`[guard] name-finder unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false, kind: "unavailable" };
  }
  const strangers = names.filter((n) => !isAllowedPerson(n, plain, list));
  if (strangers.length === 0) return { ok: true, text };
  // A tool result keeps its business content with the names blanked out;
  // anything she typed or Aeon would save or say is refused outright.
  if (at !== "tool_result") return { ok: false, kind: "client_name" };
  let redacted = text;
  for (const n of strangers) redacted = redacted.replace(new RegExp(escape(n), "gi"), NAME_WITHHELD);
  // Names are found in the cleaned copy but blanked in the original, so a copy
  // written differently ("Kévin", hidden characters) can survive. Check again:
  // if any stranger is still there, withhold the whole result.
  try {
    const again = normalizeForCheck(redacted);
    if ((await findNames(again)).some((n) => !isAllowedPerson(n, again, list))) return { ok: false, kind: "client_name" };
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
  cached = { at: Date.now(), list: { names: names.filter(present), contacts: contacts.filter(present) } };
  return cached.list;
}
