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
// Migration 045 has the first cue list in SQL (practice_os.name_looks_sensitive)
// for its one-time backfill. The list below has grown since (Nov 3: "survivors",
// "hope house", "safe place", "abuse", "trafficking" ...), and with no new
// migration the app re-flags old cards itself: lib/referrals/sensitive-sites.ts
// reflagSensitive runs before every discovery and save, so any card these cues
// now catch loses its street on the next search. When unsure, a name counts as
// sensitive: a false flag only hides an address.
import { createHash } from "node:crypto";
import { isSensitive as typeIsSensitive } from "./catalog";
import { normalizeStreet, zip5 } from "./evidence/normalize";

/** NUCC taxonomy codes that mark a sensitive organisation. Empty: NUCC has none for DV/SA agencies or shelters. */
export const SENSITIVE_NUCC: readonly string[] = [];

/** Lower case, accents and apostrophes (straight and curly) deleted, everything else not a letter or digit a space. */
export function cueText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Bump when the cues change: lib/referrals/sensitive-sites.ts re-flags old cards once per version. */
export const CUE_VERSION = 2;

/** Plain cues, on cueText. Plurals included. Always sensitive, whatever else the name says. */
export const SENSITIVE_CUES = new RegExp(
  "\\b(?:" +
    [
      "domestic (?:violence|abuse)", "family violence", "intimate partner", "dating violence", "anti ?violence",
      "violence (?:prevention|intervention)(?! (?:research|institute|lab|laboratory|study|studies|science))",
      "sexual (?:assault|abuse|violence|exploitation)", "assault", "rape", "incest", "stalking", "trafficking", "trafficked",
      "(?<!(?:substance|drug|alcohol|chemical) )abus(?:e|ed|ive)", "battered",
      "victims? of (?:crime|violence|abuse|assault|trafficking|domestic|sexual|rape)", "victim (?:services|advocates?|advocacy|assistance)",
      "survivors? of (?:abuse|violence|assault|trafficking|domestic|sexual|rape|incest)",
      "womens (?:center|centre|centers|shelter|shelters|refuge|safe ?house|resource center|services|crisis|aid|advocacy)",
      "shelters?", "safe ?houses?", "safe ?places?", "safe ?homes?", "safe ?space",
      "hope ?houses?", "house of hope", "houses of hope", "ruths house", "apna ghar",
      "family justice", "justice center", "(?:rape|sexual assault|sexual violence|domestic violence|dv) crisis",
      "transitional (?:housing|living)", "ywca",
      // Chicago DV and SA agencies by name.
      "sarahs inn", "family rescue", "mujeres latinas en accion", "kan win", "wings program", "casa de esperanza",
    ].join("|") +
    ")\\b",
);
/** Agency names too plain to match inside other names: only the whole name counts ("Between Friends", "Resilience"). */
const AGENCY_NAMES = new Set(["between friends", "life span", "resilience", "wings", "kan win"]);
const NAME_FILLER = /^(?:(?:test|sample|the)\s+)*|(?:\s+(?:chicago|inc|il|illinois|nfp|org))*$/g;

/** "Survivors" alone is sensitive, except next to cancer, loss or grief ("Cancer Survivors Network"). */
const SURVIVORS = /\bsurvivors?\b/;
const SURVIVORS_OK = /\b(?:cancer|oncology|loss|suicide|grief|bereave\w*|widow\w*|leukemia|lymphoma|tumou?rs?|breast|survivorship|heart|stroke|burn|transplant|cardiac|brain|ovarian|prostate|lung|colon|hospice|covid)\b/;

/** Soft cues: sensitive unless the name is plainly hospice, home health, funeral or church ("Safe Harbor Hospice"). */
const SOFT_CUES = /\b(?:safe harbou?rs?|safe ?havens?|safe passage|sanctuar(?:y|ies))\b/;
/** Borderline names: one of these with a services word counts as sensitive (soft too). */
export const BORDERLINE = /\b(?:house of [a-z]+|havens?|refuges?|harbou?rs? house|hope center|new beginnings?|new hope)\b/;
export const SERVICES_WORD = /\b(?:services?|centers?|centres?|projects?|network|programs?|ministr(?:y|ies)|alliance|outreach|homes?|house|inc|foundation|coalition|place|support)\b/;
const CARE_CONTEXT = /\b(?:hospice|home health|home care|funeral|cemetery|memorial|church|chapel|parish|cathedral|temple|synagogue|mosque|palliative|senior living|assisted living|nursing)\b/;

/** Edit distance counting a swap of two neighbours as one, for "sheltr" and "shleter". */
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

function textLooksSensitive(t: string): boolean {
  if (SENSITIVE_CUES.test(t)) return true;
  if (AGENCY_NAMES.has(t.replace(NAME_FILLER, "").trim())) return true;
  if (SURVIVORS.test(t) && !SURVIVORS_OK.test(t)) return true;
  if (t.split(" ").some((w) => w.length >= 6 && (editDistance(w, "shelter") <= 1 || editDistance(w, "shelters") <= 1))) return true;
  if (CARE_CONTEXT.test(t)) return false;
  if (SOFT_CUES.test(t)) return true;
  // "Haven House", "House of Ruth Services": the borderline word plus a services word (itself excluded).
  const border = t.match(BORDERLINE)?.[0];
  return Boolean(border && SERVICES_WORD.test(t.replace(border, " ")));
}

export function looksSensitive(...names: (string | null | undefined)[]): boolean {
  return names.some((n) => {
    if (!n) return false;
    const t = cueText(n);
    // Initials spelled out ("H.O.P.E. House") read as the word too.
    const joined = t.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ""));
    return textLooksSensitive(t) || (joined !== t && textLooksSensitive(joined));
  });
}

/** Sensitive by kind or NUCC code (not only by a name cue): only these spread to others at the same street. */
export function sensitiveByKind(c: { type?: string | null; source_type?: string | null; taxonomy?: string | null }): boolean {
  const type = c.type ?? c.source_type;
  return Boolean((type && typeIsSensitive(type)) || (c.taxonomy && SENSITIVE_NUCC.includes(c.taxonomy)));
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
