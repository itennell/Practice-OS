// Sensitive referral sources: domestic violence and sexual assault agencies
// and shelters (catalog sensitive: true). Their location can put people in
// danger, so a sensitive card keeps a city only and every output leaves out
// its street, ZIP, map point and distance. A card is sensitive when:
//   - its catalog type is sensitive (dv_sa_agencies, shelters), however it was added;
//   - its NUCC code is on SENSITIVE_NUCC (none today: NUCC has no code for these
//     agencies or for shelters, checked against the catalog's codes 2026-11-02);
//   - its name carries one of the cues below, or a borderline one ("house of ...",
//     haven, refuge, sanctuary) next to a services word. A false flag only hides
//     an address, so borderline names count as sensitive;
//   - or (NPPES individuals) it sits at the same street address as a known
//     sensitive card (siteHashes; only a one-way hash of that address is kept).
// Migration 045 has the same cue list in SQL (practice_os.name_looks_sensitive)
// for the backfill; tests/referrals-discovery-db.test.ts checks they agree.
import { createHash } from "node:crypto";
import { isSensitive as typeIsSensitive } from "./catalog";
import { normalizeStreet, zip5 } from "./evidence/normalize";

/** NUCC taxonomy codes that mark a sensitive organisation. Empty: NUCC has none for DV/SA agencies or shelters. */
export const SENSITIVE_NUCC: readonly string[] = [];

/** Lower case, apostrophes (straight and curly) deleted, everything else not a letter or digit a space. */
export function cueText(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Plain cues, on cueText. Plurals included. */
export const SENSITIVE_CUES =
  /\b(?:domestic (?:violence|abuse)|family violence|intimate partner violence|sexual (?:assault|abuse|violence)|rape crisis|battered|womens (?:center|centre|centers|shelter|shelters|refuge|safe ?house|resource center)|shelters?|safe ?houses?|safe harbou?rs?|house of hope|ruths house|anti ?violence|survivors? of|violence (?:prevention|intervention))\b/;

/** Borderline names: one of these with a services word counts as sensitive. */
export const BORDERLINE = /\b(?:house of [a-z]+|havens?|refuges?|sanctuar(?:y|ies))\b/;
export const SERVICES_WORD = /\b(?:services?|centers?|centres?|projects?|network|programs?|ministr(?:y|ies)|alliance|outreach|homes?|house|inc|foundation|coalition|place|support)\b/;

export function looksSensitive(...names: (string | null | undefined)[]): boolean {
  return names.some((n) => {
    if (!n) return false;
    const t = cueText(n);
    if (SENSITIVE_CUES.test(t)) return true;
    // "Haven House", "House of Ruth Services": the borderline word plus a services word (itself excluded).
    const border = t.match(BORDERLINE)?.[0];
    return Boolean(border && SERVICES_WORD.test(t.replace(border, " ")));
  });
}

/** Is this card (or search result) a sensitive kind? */
export function isSensitiveSource(c: { type?: string | null; source_type?: string | null; taxonomy?: string | null; name?: string | null; organization?: string | null }): boolean {
  const type = c.type ?? c.source_type;
  if (type && typeIsSensitive(type)) return true;
  if (c.taxonomy && SENSITIVE_NUCC.includes(c.taxonomy)) return true;
  return looksSensitive(c.name, c.organization);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/**
 * One-way keys for a street address, so a person NPPES lists at a sensitive
 * site can be marked too without keeping that site's street. Two forms: our
 * USPS normalizing, and the plain one the migration's SQL backfill can make
 * (lower case, letters and digits only, then the ZIP).
 */
export function siteHashes(street: string | null | undefined, zip: string | null | undefined): string[] {
  const z = zip5(zip);
  if (!street || !z) return [];
  const plain = street.toLowerCase().replace(/[^a-z0-9]/g, "");
  const ours = normalizeStreet(street).replace(/[^a-z0-9]/g, "");
  return [...new Set([`${plain}${z}`, `${ours}${z}`].filter((k) => k.length > z.length + 2).map(sha))];
}

/** Tier or plan reasons without distance words ("0.4 mi from your office"), for a sensitive card. */
export function withoutDistance(reasons: string[]): string[] {
  return reasons.filter((r) => !/\b\d+(?:\.\d+)?\s*(?:mi|miles?)\b|\bmiles?\b|\bfrom your (?:office|door)\b|\bnearby\b|\bclose by\b|\bon your block\b|\bin your zip code\b/i.test(r));
}

export const PUBLIC_LINE_ONLY = "Contact through their public line only.";
