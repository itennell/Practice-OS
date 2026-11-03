// The do-not-contact org key (migration 045), written for every card she lists
// (with or without an NPI): the normalized name (a group's name; for a person,
// their name at their group) and the normalized street and ZIP, the city, or the ZIP.
// Plain code, no database, so the page, the searches and the tests share it.
import { normalizeName, normalizeOrg, normalizeStreet, zip5 } from "./evidence/normalize";

export type KeyCard = {
  name: string;
  organization?: string | null;
  npi_type?: "individual" | "organization" | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
};

export type OrgKey = {
  org_key: string;
  name_key: string;
  street_key: string | null;
  city_key: string | null;
  zip_key?: string | null;
  /** The suite or floor ("u:210", "fl:2"), compared only, never stored: listed keys from the database have none. */
  unit_key?: string | null;
  /** A person (npi_type individual), compared only. */
  person?: boolean;
};

/**
 * The suite or floor of a street address: "Ste210", "Suite 0210", "#210" give "u:210";
 * "2nd Fl", "Floor 2" give "fl:2". A suite wins over a floor ("2nd Floor Suite 210" is u:210).
 */
export function unitOf(address: string | null | undefined): string | null {
  const a = (address ?? "").toLowerCase();
  const unit = a.match(/\b(?:ste|suite|unit|apt|rm|room|bldg|building)\.?\s*#?\s*([a-z0-9-]+)\b/) ?? a.match(/#\s*([a-z0-9-]+)/);
  if (unit) return `u:${unit[1].replace(/-/g, "").replace(/^0+(?=[0-9a-z])/, "")}`;
  const floor = a.match(/\b(\d+)(?:st|nd|rd|th)?\s*(?:fl|flr|floor)\b/) ?? a.match(/\b(?:fl|flr|floor)\.?\s*(\d+)\b/);
  return floor ? `fl:${floor[1].replace(/^0+(?=\d)/, "")}` : null;
}

const cityKey = (city: string | null | undefined) => {
  const c = (city ?? "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  return c.length >= 2 ? c : null;
};

const SAMPLE = /\[\s*sample\s*\]\s*/gi;

/** The parts of a card's org key, or null when its name has nothing to key on. */
export function orgKeyOf(card: KeyCard): OrgKey | null {
  let name: string;
  // The demo's [Sample] label doesn't change who someone is.
  const raw = card.name.replace(SAMPLE, "");
  const group = card.organization?.replace(SAMPLE, "") ?? null;
  if (card.npi_type === "individual") {
    const n = normalizeName(raw);
    if (!n.last) return null;
    const at = normalizeOrg(group);
    name = `${[n.first, n.last].filter(Boolean).join(" ")}${at ? ` at ${at}` : ""}`;
  } else {
    name = normalizeOrg(raw) || normalizeOrg(group);
  }
  name = name.slice(0, 200);
  if (name.length < 2) return null;
  const street = normalizeStreet(card.address);
  const z = zip5(card.zip);
  const street_key = street && z ? `${street} ${z}`.slice(0, 200) : null;
  const city_key = cityKey(card.city);
  const zip_key = z || null;
  return {
    org_key: `${name}|${street_key ?? city_key ?? zip_key ?? ""}`.slice(0, 400),
    name_key: name,
    street_key,
    city_key,
    zip_key,
    unit_key: unitOf(card.address),
    person: card.npi_type === "individual",
  };
}

// Generic words at the end of a name that don't make it a different place:
// "Westside Oncology Partners" is "Westside Oncology", and "W Side" is "West Side" is "Westside".
const GENERIC_TAIL = new Set([
  "group", "groups", "associates", "assoc", "partners", "partnership", "practice", "practices", "clinic", "clinics",
  "center", "centre", "centers", "ctr", "services", "service", "company", "corporation", "incorporated", "limited",
  "pa", "pc", "sc", "llc", "pllc", "inc", "ltd", "co", "corp", "llp", "of", "and",
]);
// Words that don't name anyone on their own: a tail is kept when only these would be left
// ("Oncology Partners" stays "oncologypartners", never just "oncology").
const GENERIC_HEAD = new Set([
  "oncology", "hospice", "family", "medical", "medicine", "health", "healthcare", "care", "home", "homes", "counseling",
  "therapy", "mental", "behavioral", "cancer", "wellness", "community", "primary", "pediatric", "pediatrics", "senior",
  "funeral", "social", "clinical", "psychiatry", "psychology", "palliative", "chicago", "illinois", "test", "sample",
  "city", "regional", "general",
]);
const DIRECTION_WORD: Record<string, string> = { n: "north", s: "south", e: "east", w: "west" };

/** The words of each side of a name key ("first last at group"), generic tails gone. */
function compactWords(nameKey: string): string[][] {
  const compactPart = (part: string) => {
    const words = part
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w && w !== "and" && w !== "the")
      .map((w) => DIRECTION_WORD[w] ?? w);
    const full = words.join("");
    const named = (ws: string[]) => ws.some((w) => !GENERIC_HEAD.has(w) && !GENERIC_TAIL.has(w));
    while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1]) && named(words.slice(0, -1))) words.pop();
    return words.join("").length >= 4 ? words : [full];
  };
  // A person's key is "first last at group": each side compacted on its own.
  return nameKey.split(/ at /).map(compactPart);
}

/** A name key with spacing, punctuation, "and" and generic trailing words gone, for comparing. */
export function compactName(nameKey: string): string {
  return compactWords(nameKey).map((w) => w.join("")).join("@");
}

/** Edit distance counting a swap of two neighbours as one. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/**
 * The same name compacted, or one typo apart: only names of 8 or more letters, and
 * never in the first word ("Smith"/"Smyth", "Hope"/"Home Hospice", "Ann Kim"/"Ann Kym"
 * stay apart). Only ever used once the place matches.
 */
function nearName(a: string[], b: string[]): boolean {
  const ja = a.join("");
  const jb = b.join("");
  if (ja === jb) return true;
  if (Math.min(ja.length, jb.length) < 8 || a.length < 2 || b.length < 2 || a[0] !== b[0]) return false;
  return editDistance(a.slice(1).join(""), b.slice(1).join("")) <= 1;
}

const DIRECTIONALS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw"]);

/** A street key read back: number, directional (may be missing), the rest, ZIP. Glued or trailing units dropped. */
function streetParts(streetKey: string) {
  const t = streetKey.split(" ").filter(Boolean);
  const zip = /^\d{5}$/.test(t[t.length - 1] ?? "") ? t.pop()! : null;
  // "ste210", "2nd" (left over from "2nd Fl"), a bare trailing suite number.
  while (t.length > 2 && /^(?:(?:ste|suite|unit|apt|rm|bldg)[a-z0-9-]*|\d+(?:st|nd|rd|th)|\d+[a-z]?)$/.test(t[t.length - 1])) t.pop();
  const num = /^\d+[a-z]?$/.test(t[0] ?? "") ? t.shift()! : null;
  const dir = DIRECTIONALS.has(t[0] ?? "") ? t.shift()! : null;
  return { num, dir, rest: t.join(""), zip };
}

/** The same street and ZIP: units ignored, and a missing directional matches ("2400 Lincoln Ave" = "2400 N Lincoln Ave"). */
function sameStreet(a: string, b: string): boolean {
  const x = streetParts(a);
  const y = streetParts(b);
  if (x.num !== y.num || x.rest !== y.rest || !x.rest) return false;
  if (x.zip && y.zip && x.zip !== y.zip) return false;
  return !x.dir || !y.dir || x.dir === y.dir;
}

/** The same place: the same street and ZIP; else (one has no street) the same city, and ZIP when both have one; else the same ZIP. */
function samePlace(card: OrgKey, listed: OrgKey): boolean {
  if (card.street_key && listed.street_key) return sameStreet(card.street_key, listed.street_key);
  const cz = card.zip_key ?? card.street_key?.slice(-5) ?? null;
  const lz = listed.zip_key ?? listed.street_key?.slice(-5) ?? null;
  if (card.city_key && listed.city_key) return card.city_key === listed.city_key && (!cz || !lz || cz === lz);
  if (cz && lz) return cz === lz;
  return false;
}

/**
 * True when a suppressed org key names this card. Every match needs a place in
 * common (samePlace); the same name in another city is another branch and stays
 * allowed. Then (Nov 3, PR #141 review) any one of:
 *   - the same name, compacted ("West Side Oncology Partners" = "Westside
 *     Oncology"), or one typo apart;
 *   - a person whose group is the listed organisation;
 *   - a person with no organisation at a listed organisation's street, when the
 *     suites don't differ (someone NPPES lists at that office).
 * A different named organisation at the same street (another tenant of a
 * hospital building) is never blocked, and a listed person never blocks their building.
 */
export function keyMatches(card: OrgKey, listed: OrgKey): boolean {
  if (!samePlace(card, listed)) return false;
  const listedSides = compactWords(listed.name_key);
  const cardSides = compactWords(card.name_key);
  const whole = (sides: string[][]) => (sides.length === 1 ? sides[0] : [sides.map((w) => w.join("")).join("@")]);
  if (nearName(whole(cardSides), whole(listedSides))) return true;
  if (listed.person || listedSides.length > 1) return false;
  if (cardSides.length > 1 && nearName(cardSides[cardSides.length - 1], listedSides[0])) return true;
  // The street rule needs to know the listed key is an organisation and its suite. A key read back
  // from her stored list has neither (person is undefined), so it never applies there: that needs
  // a migration adding unit_key and person to referral_suppressions_org.
  if (listed.person === undefined) return false;
  const unitsAgree = !card.unit_key || !listed.unit_key || card.unit_key === listed.unit_key;
  return Boolean(card.person && cardSides.length === 1 && card.street_key && listed.street_key && unitsAgree);
}

/**
 * A debrief's "who else" names a person or an organisation with no place at
 * all. Suggesting a card is the safe side to refuse, so there the name alone
 * is enough: anyone on her list with that name is not suggested again.
 */
export function nameSuppressed(card: KeyCard, list: Suppressed): boolean {
  const key = orgKeyOf(card);
  const name = key ? compactName(key.name_key) : "";
  return Boolean(key && list.orgs.some((o) => compactName(o.name_key) === name));
}

/** Her do-not-contact list: NPIs, and org keys for cards without one. */
export type Suppressed = { npis: Set<string>; orgs: OrgKey[] };

export const NOTHING_SUPPRESSED: Suppressed = { npis: new Set(), orgs: [] };

/** Is this card (or search result) on her do-not-contact list? */
export function isSuppressed(card: KeyCard & { npi?: string | null }, list: Suppressed): boolean {
  if (card.npi && list.npis.has(card.npi)) return true;
  if (list.orgs.length === 0) return false;
  const key = orgKeyOf(card);
  return Boolean(key && list.orgs.some((o) => keyMatches(key, o)));
}

/** An NPPES provider as the do-not-contact check reads it. */
export const providerKeyCard = (p: { npi: string; name: string; organization: string | null; practiceName: string | null; npiType: "individual" | "organization"; address: string; city: string; zip: string }) => ({
  npi: p.npi,
  name: p.npiType === "organization" ? (p.practiceName ?? p.organization ?? p.name) : p.name,
  organization: p.practiceName ?? p.organization,
  npi_type: p.npiType,
  address: p.address,
  city: p.city,
  zip: p.zip,
});
