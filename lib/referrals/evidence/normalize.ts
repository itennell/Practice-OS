// Plain-code normalizing for matching a provider across sources: names without
// titles and credentials, street lines in USPS Publication 28 short forms,
// phones as 10 digits. No dependency; Jaro-Winkler is the usual name metric.

const TITLES = new Set(["dr", "doctor", "mr", "mrs", "ms", "miss", "mx", "prof"]);
const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);
// Credentials NPPES, CMS and state lists put after a name.
const CREDENTIALS = new Set([
  "md", "do", "phd", "psyd", "edd", "dnp", "np", "aprn", "fnp", "pmhnp", "cnm", "pa", "pac", "rn", "bsn", "msn", "mph",
  "lcsw", "lcpc", "lpc", "lmft", "lmhc", "lisw", "licsw", "lsw", "msw", "ma", "ms", "mse", "med", "faap", "facog", "facp",
  "bcba", "cadc", "ncc", "rpt", "facs",
]);

/** `lasts`: the last name and, for a hyphenated one, each part ("Rivera-Lopez" may be listed as "Rivera"). */
export type PersonName = { first: string; last: string; tokens: string[]; lasts: string[] };

/** "Dr. Maria L. Rivera-Lopez, MD" or "Rivera-Lopez, Maria" to { first: "maria", last: "riveralopez" }. */
export function normalizeName(raw: string | null | undefined): PersonName {
  const words = (part: string) =>
    part
      .replace(/'/g, "")
      .replace(/[^a-z\s-]/g, " ")
      .split(/\s+/)
      .map((w) => w.replace(/^-+|-+$/g, ""))
      .filter((w) => w && !TITLES.has(w) && !SUFFIXES.has(w) && !CREDENTIALS.has(w));
  const parts = (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(",")
    .map(words);
  // After a comma: credentials ("Maria Rivera, MD") drop out above; anything left means "Last, First".
  const rest = parts.slice(1).flat();
  const all = rest.length ? [...rest, ...parts[0]] : parts[0];
  const kept = all.filter((w) => w.length > 1); // middle initials don't decide a match
  const rawLast = kept[kept.length - 1] ?? "";
  const tokens = kept.map((w) => w.replace(/-/g, ""));
  const last = tokens[tokens.length - 1] ?? "";
  const lasts = rawLast.includes("-") ? [last, ...rawLast.split("-").filter((x) => x.length > 1)] : [last];
  return { first: tokens[0] ?? "", last, tokens, lasts };
}

/** Organization names: lower case, no punctuation, no "LLC" / "PLLC" / "Inc" / "The". */
export function normalizeOrg(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["llc", "pllc", "pc", "sc", "ltd", "inc", "the", "llp", "corp", "co"].includes(w))
    .join(" ");
}

// USPS Publication 28 Appendix C1 (street suffixes) and B (directionals), the common ones.
const SUFFIX_ABBR: Record<string, string> = {
  street: "st", avenue: "ave", av: "ave", boulevard: "blvd", road: "rd", drive: "dr", lane: "ln", court: "ct",
  place: "pl", parkway: "pkwy", highway: "hwy", terrace: "ter", square: "sq", circle: "cir", plaza: "plz", way: "way",
  center: "ctr", trail: "trl", expressway: "expy",
};
const DIRECTIONAL: Record<string, string> = {
  north: "n", south: "s", east: "e", west: "w", northeast: "ne", northwest: "nw", southeast: "se", southwest: "sw",
};
const UNIT_WORDS = /(?:\b(?:ste|suite|unit|apt|apartment|fl|floor|rm|room|bldg|building|dept|ofc|office)\b|#).*$/;

/** "2400 North Lincoln Avenue, Suite 210" to "2400 n lincoln ave" (the unit doesn't decide a match). */
export function normalizeStreet(raw: string | null | undefined): string {
  const s = (raw ?? "")
    .toLowerCase()
    .replace(/#/g, " # ")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(UNIT_WORDS, "")
    .trim();
  return s
    .split(" ")
    .filter(Boolean)
    .map((w) => SUFFIX_ABBR[w] ?? DIRECTIONAL[w] ?? w)
    .join(" ");
}

export function zip5(raw: string | null | undefined): string {
  const d = (raw ?? "").replace(/\D/g, "");
  return d.length >= 5 ? d.slice(0, 5) : "";
}

/** Ten digits (a leading US 1 dropped), or "" when it isn't a US number. */
export function phoneDigits(raw: string | null | undefined): string {
  let d = (raw ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  return d.length === 10 ? d : "";
}

export function formatPhone(digits: string): string {
  return digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}` : digits;
}

/** Jaro-Winkler similarity, 0 to 1 (Winkler 1990; prefix scale 0.1, up to 4 characters). */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (bHit[j] || a[i] !== b[j]) continue;
      aHit[i] = bHit[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < Math.min(4, a.length, b.length) && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}
