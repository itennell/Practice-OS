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

export type OrgKey = { org_key: string; name_key: string; street_key: string | null; city_key: string | null; zip_key?: string | null };

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
  return { org_key: `${name}|${street_key ?? city_key ?? zip_key ?? ""}`.slice(0, 400), name_key: name, street_key, city_key, zip_key };
}

// Generic words at the end of a name that don't make it a different place:
// "Westside Oncology Partners" is "Westside Oncology", and "West Side" is "Westside".
const GENERIC_TAIL = new Set([
  "group", "groups", "associates", "assoc", "partners", "partnership", "practice", "practices", "clinic", "clinics",
  "center", "centre", "centers", "ctr", "services", "service", "company", "corporation", "incorporated", "limited",
  "pa", "pc", "sc", "llc", "pllc", "inc", "ltd", "co", "corp", "llp", "of", "and",
]);

/** A name key with spacing, punctuation, "and" and generic trailing words gone, for comparing. */
export function compactName(nameKey: string): string {
  const compactPart = (part: string) => {
    const words = part.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w && w !== "and" && w !== "the");
    const full = words.join("");
    while (words.length > 1 && GENERIC_TAIL.has(words[words.length - 1])) words.pop();
    const short = words.join("");
    return short.length >= 4 ? short : full;
  };
  // A person's key is "first last at group": each side compacted on its own.
  return nameKey.split(/ at /).map(compactPart).join("@");
}

const compactStreet = (streetKey: string | null | undefined) => (streetKey ? streetKey.replace(/[^a-z0-9]/g, "") : null);

/** The same place: the same street and ZIP; else (one has no street) the same city, and ZIP when both have one; else the same ZIP. */
function samePlace(card: OrgKey, listed: OrgKey): boolean {
  if (card.street_key && listed.street_key) return compactStreet(card.street_key) === compactStreet(listed.street_key);
  const cz = card.zip_key ?? card.street_key?.slice(-5) ?? null;
  const lz = listed.zip_key ?? listed.street_key?.slice(-5) ?? null;
  if (card.city_key && listed.city_key) return card.city_key === listed.city_key && (!cz || !lz || cz === lz);
  if (cz && lz) return cz === lz;
  return false;
}

/**
 * True when a suppressed org key names this card. Names are compared compacted
 * ("West Side Oncology Partners" = "Westside Oncology"), and a place in common is
 * needed (samePlace). Two more ways to match (Nov 3):
 *   - anyone at a listed organisation's street and ZIP, whatever their name
 *     (a person at a do-not-contact office). Not for a listed person ("name at
 *     group"): one person asking not to be contacted doesn't block their building;
 *   - a person whose group is the listed organisation, at the same place.
 * Without a place in common it is NOT a match: the same name in another city is
 * another branch and stays allowed.
 */
export function keyMatches(card: OrgKey, listed: OrgKey): boolean {
  const listedName = compactName(listed.name_key);
  const listedIsPerson = listedName.includes("@");
  if (!listedIsPerson && card.street_key && listed.street_key && compactStreet(card.street_key) === compactStreet(listed.street_key)) return true;
  const cardName = compactName(card.name_key);
  const atListedOrg = !listedIsPerson && cardName.includes("@") && cardName.slice(cardName.lastIndexOf("@") + 1) === listedName;
  if (cardName !== listedName && !atListedOrg) return false;
  return samePlace(card, listed);
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
