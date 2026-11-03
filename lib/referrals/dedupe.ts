// Is this organisation or person already on her board? For a card she adds by
// hand, a CSV row, or a search result: the same NPI, CMS number (CCN) or
// OpenStreetMap id; else an organisation's normalized name with the same
// street; else a person's name at the same group, or with the same street
// (lib/referrals/evidence/match.ts). A phone alone never merges. The same name in
// the same city with nothing else to go on is a possible duplicate she decides.
// Plain code, no database.
import { NAME_MIN, orgNameScore, personNameScore, sameStreet } from "./evidence/match";
import { zip5 } from "./evidence/normalize";

export type DupInput = {
  npi?: string | null;
  ccn?: string | null;
  osmRef?: string | null;
  name: string;
  organization?: string | null;
  isOrg: boolean;
  street?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
};

export type DupCard = {
  id: string;
  name: string;
  npi?: string | null;
  ccn?: string | null;
  osm_ref?: string | null;
  organization?: string | null;
  npi_type?: "individual" | "organization" | null;
  address?: string | null;
  city?: string | null;
  zip?: string | null;
  phone?: string | null;
};

export type DupHow = "npi" | "ccn" | "osm" | "name_address" | "name_org" | "possible";
/** `possible`: the same name in the same city with no street or ZIP to tell them apart. Never merged on its own: she chooses. */
export type Dup<C extends DupCard = DupCard> = { card: C; how: DupHow };

export const DUP_LABEL: Record<DupHow, string> = {
  npi: "same NPI",
  ccn: "same CMS number",
  osm: "same OpenStreetMap place",
  name_address: "same name and street address",
  name_org: "same name at the same organization",
  possible: "same name in the same city; maybe the same, you choose",
};

const sameCity = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/**
 * The card this matches, or null when it is someone new. The strongest match
 * wins. A phone alone never merges two cards: the name must match and the
 * street too. The same name in the same city with no street or ZIP on one side
 * comes back as `possible`, for her to decide.
 */
export function findDuplicate<C extends DupCard>(input: DupInput, cards: C[]): Dup<C> | null {
  for (const c of cards) {
    if (input.npi && c.npi === input.npi) return { card: c, how: "npi" };
    if (input.ccn && c.ccn === input.ccn) return { card: c, how: "ccn" };
    if (input.osmRef && c.osm_ref === input.osmRef) return { card: c, how: "osm" };
  }
  let best: Dup<C> | null = null;
  const rank: DupHow[] = ["name_address", "name_org", "possible"];
  for (const c of cards) {
    // Two different NPIs are two different providers, whatever their names.
    if (input.npi && c.npi && input.npi !== c.npi) continue;
    const cardIsOrg = c.npi_type !== "individual";
    const street = sameStreet({ street: input.street, zip: input.zip }, { street: c.address, zip: c.zip });
    const placeless = (!input.street && !zip5(input.zip)) || (!c.address && !zip5(c.zip));
    let how: DupHow | null = null;
    if (input.isOrg && cardIsOrg) {
      if (orgNameScore(input.name, c.name) >= NAME_MIN) {
        if (street) how = "name_address";
        else if (placeless && sameCity(input.city, c.city)) how = "possible";
      }
    } else if (!input.isOrg && !cardIsOrg) {
      if (personNameScore(input.name, c.name) >= NAME_MIN) {
        if (street) how = "name_address";
        else if (input.organization && c.organization && orgNameScore(input.organization, c.organization) >= NAME_MIN) how = "name_org";
        else if (placeless && sameCity(input.city, c.city)) how = "possible";
      }
    }
    if (how && (!best || rank.indexOf(how) < rank.indexOf(best.how))) best = { card: c, how };
  }
  return best;
}
