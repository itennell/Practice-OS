// Is this organisation or person already on her board? For a card she adds by
// hand, a CSV row, or a search result: the same NPI, CMS number (CCN) or
// OpenStreetMap id; else an organisation's normalized name with the same
// street, phone or city; else a person's name at the same group, or with the
// same street or phone (lib/referrals/evidence/match.ts). Plain code, no database.
import { matchCandidate, NAME_MIN, orgNameScore, personNameScore } from "./evidence/match";
import { phoneDigits, zip5 } from "./evidence/normalize";

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

export type DupHow = "npi" | "ccn" | "osm" | "name_address" | "name_city" | "name_org";
export type Dup<C extends DupCard = DupCard> = { card: C; how: DupHow };

export const DUP_LABEL: Record<DupHow, string> = {
  npi: "same NPI",
  ccn: "same CMS number",
  osm: "same OpenStreetMap place",
  name_address: "same name and address or phone",
  name_city: "same name in the same city",
  name_org: "same name at the same organization",
};

const sameCity = (a?: string | null, b?: string | null) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

/** The card this matches, or null when it is someone new. The strongest match wins. */
export function findDuplicate<C extends DupCard>(input: DupInput, cards: C[]): Dup<C> | null {
  for (const c of cards) {
    if (input.npi && c.npi === input.npi) return { card: c, how: "npi" };
    if (input.ccn && c.ccn === input.ccn) return { card: c, how: "ccn" };
    if (input.osmRef && c.osm_ref === input.osmRef) return { card: c, how: "osm" };
  }
  let best: Dup<C> | null = null;
  const rank: DupHow[] = ["name_address", "name_org", "name_city"];
  for (const c of cards) {
    // Two different NPIs are two different providers, whatever their names.
    if (input.npi && c.npi && input.npi !== c.npi) continue;
    const cardIsOrg = c.npi_type !== "individual";
    let how: DupHow | null = null;
    if (input.isOrg && cardIsOrg) {
      const m = matchCandidate(
        { name: input.name, organization: input.name, isOrg: true, street: input.street, zip: input.zip, phone: input.phone },
        { name: c.name, organization: c.name, isOrg: true, street: c.address, zip: c.zip, phone: c.phone },
      );
      if (m) how = "name_address";
      else if (orgNameScore(input.name, c.name) >= NAME_MIN) {
        // A hand-typed card often has only a city, or only a ZIP.
        const placeless = !input.street || !c.address;
        const samePlace = sameCity(input.city, c.city) || Boolean(zip5(input.zip) && zip5(input.zip) === zip5(c.zip));
        const samePhone = Boolean(phoneDigits(input.phone) && phoneDigits(input.phone) === phoneDigits(c.phone));
        if (samePhone) how = "name_address";
        else if (placeless && samePlace) how = "name_city";
      }
    } else if (!input.isOrg && !cardIsOrg) {
      const m = matchCandidate(
        { name: input.name, isOrg: false, street: input.street, zip: input.zip, phone: input.phone },
        { name: c.name, isOrg: false, street: c.address, zip: c.zip, phone: c.phone },
      );
      if (m && m.method === "name_address") how = "name_address";
      else if (personNameScore(input.name, c.name) >= NAME_MIN && input.organization && c.organization && orgNameScore(input.organization, c.organization) >= NAME_MIN) how = "name_org";
    }
    if (how && (!best || rank.indexOf(how) < rank.indexOf(best.how))) best = { card: c, how };
  }
  return best;
}
