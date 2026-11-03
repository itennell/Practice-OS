// The do-not-contact key for a card with no NPI (migration 045): the
// normalized name (a group's name; for a person, their name at their group)
// and the normalized street and ZIP, or the city when there is no street.
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

export type OrgKey = { org_key: string; name_key: string; street_key: string | null; city_key: string | null };

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
  return { org_key: `${name}|${street_key ?? city_key ?? ""}`, name_key: name, street_key, city_key };
}

/**
 * True when a suppressed org key names this card: the same name, and the same
 * street and ZIP; or, when either has no street, the same city (or no place at
 * all on one side). Two branches of one chain at different streets are different.
 */
export function keyMatches(card: OrgKey, listed: OrgKey): boolean {
  if (card.name_key !== listed.name_key) return false;
  if (card.street_key && listed.street_key) return card.street_key === listed.street_key;
  if (!card.city_key || !listed.city_key) return true;
  return card.city_key === listed.city_key;
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
