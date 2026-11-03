// Sensitive referral sources: domestic violence and sexual assault agencies
// and shelters (catalog sensitive: true). Their location can put people in
// danger, so a sensitive card keeps a city only and every output leaves out
// its street, ZIP, map point and distance. A card is sensitive when:
//   - its catalog type is sensitive (dv_sa_agencies, shelters), however it was added;
//   - its NUCC code is on SENSITIVE_NUCC (none today: NUCC has no code for these
//     agencies or for shelters, checked against the catalog's codes 2026-11-02);
//   - or its name carries one of the plain cues below (an NPPES group, a CMS or
//     OpenStreetMap place named "... Women's Shelter" or "... Rape Crisis Center").
// Plain code, no database: the page, searches, tools and tests share it.
import { isSensitive as typeIsSensitive } from "./catalog";

/** NUCC taxonomy codes that mark a sensitive organisation. Empty: NUCC has none for DV/SA agencies or shelters. */
export const SENSITIVE_NUCC: readonly string[] = [];

/** Name cues for DV/SA agencies and shelters. Whole words, so "Shelter Island Pediatrics" is not one. */
export const SENSITIVE_NAME =
  /\b(?:domestic (?:violence|abuse)|sexual (?:assault|violence)|rape crisis|battered|women'?s (?:shelter|refuge|safe house)|family (?:violence|shelter)|safe house|homeless shelter|emergency shelter|dv shelter|survivors? of (?:abuse|violence|assault)|anti-violence)\b/i;

export function looksSensitive(...names: (string | null | undefined)[]): boolean {
  return names.some((n) => Boolean(n && SENSITIVE_NAME.test(n)));
}

/** Is this card (or search result) a sensitive kind? */
export function isSensitiveSource(c: { type?: string | null; source_type?: string | null; taxonomy?: string | null; name?: string | null; organization?: string | null }): boolean {
  const type = c.type ?? c.source_type;
  if (type && typeIsSensitive(type)) return true;
  if (c.taxonomy && SENSITIVE_NUCC.includes(c.taxonomy)) return true;
  return looksSensitive(c.name, c.organization);
}

/** Tier or plan reasons without distance words ("0.4 mi from your office"), for a sensitive card. */
export function withoutDistance(reasons: string[]): string[] {
  return reasons.filter((r) => !/\b\d+(?:\.\d+)?\s*(?:mi|miles?)\b|\bmiles?\b|\bfrom your (?:office|door)\b|\bnearby\b|\bclose by\b|\bon your block\b|\bin your zip code\b/i.test(r));
}

export const PUBLIC_LINE_ONLY = "Contact through their public line only.";
