// The state license list. Illinois publishes IDFPR's license file as open data
// (data.illinois.gov "Professional Licensing", pzzh-kp68, ODbL, updated daily;
// IDFPR's own Check License page links it as the bulk lookup). It has no NPI
// and no street, so a card is matched by license type, last name and city, and
// only when exactly one licensee fits. IDFPR's interactive lookup is never
// automated. Other states: "not checked" until one is added here.
import type { Fact } from "../evidence/merge";
import { NAME_MIN, personNameScore } from "../evidence/match";
import { titleCase } from "../nppes";
import { jsonFetcher, str, type JsonFetcher } from "./http";

export const IL_LICENSES_URL = "https://data.illinois.gov/resource/pzzh-kp68.json";
const IL_PAGE = "https://data.illinois.gov/d/pzzh-kp68";

/** IDFPR's `description` for each credential (live values, 2026-10-29). */
const IL_DESCRIPTION: [RegExp, string][] = [
  [/\bLCPC\b/, "LICENSED CLINICAL PROFESSIONAL COUNSELOR"],
  [/\bLPC\b/, "LICENSED PROFESSIONAL COUNSELOR"],
  [/\bLCSW\b/, "LICENSED CLINICAL SOCIAL WORKER"],
  [/\bLSW\b/, "LICENSED SOCIAL WORKER"],
  [/\bLMFT\b/, "LICENSED MARRIAGE AND FAMILY THERAPIST"],
  [/\b(PSYD|PHD)\b/, "CLINICAL PSYCHOLOGIST"],
  [/\b(MD|DO)\b/, "LICENSED PHYSICIAN AND SURGEON"],
];

/** Which license to look for: from the credential, else the NUCC taxonomy (103T psychologist, 20x physician). */
export function ilDescription(credential: string | null, taxonomy: string | null): string | null {
  const c = (credential ?? "").toUpperCase().replace(/\./g, "");
  for (const [re, d] of IL_DESCRIPTION) if (re.test(c)) return d;
  if (taxonomy?.startsWith("103T")) return "CLINICAL PSYCHOLOGIST";
  if (taxonomy && /^20[78]/.test(taxonomy)) return "LICENSED PHYSICIAN AND SURGEON";
  return null;
}

/** The last name as the list spells it: before any comma, last word, letters, hyphens and apostrophes only. */
export function lastNameFor(name: string): string | null {
  const words = name.split(",")[0].trim().split(/\s+/);
  const last = words[words.length - 1]?.toUpperCase() ?? "";
  return /^[A-Z][A-Z'-]{1,40}$/.test(last) ? last : null;
}

const quote = (s: string) => `'${s.replace(/'/g, "''")}'`;

export function ilUrl(description: string, last: string, city: string): string {
  const q = new URLSearchParams({
    $select: "first_name,middle,last_name,license_status,expiration_date,city,ever_disciplined,description",
    $where: `description=${quote(description)} AND upper(last_name)=${quote(last)} AND upper(city)=${quote(city.toUpperCase())}`,
    $limit: "20",
  });
  return `${IL_LICENSES_URL}?${q}`;
}

export type LicenseCard = { name: string; credential: string | null; taxonomy: string | null; city: string | null; state: string | null; npiType: string | null };
export type LicenseResult = { facts: Fact[]; checked: boolean; note: string | null };

/** The one licensee who fits, as facts; or why none was used. */
export function ilFacts(card: LicenseCard, reply: unknown, checkedAt: string): LicenseResult {
  const rows = (Array.isArray(reply) ? (reply as Record<string, unknown>[]) : []).filter((r) => {
    const name = [str(r.first_name), str(r.last_name)].filter(Boolean).join(" ");
    return personNameScore(card.name, name) >= NAME_MIN;
  });
  if (rows.length === 0) return { facts: [], checked: true, note: "No matching license in the Illinois list for that name and city." };
  if (rows.length > 1) return { facts: [], checked: true, note: "More than one licensee with that name in that city, so Aeon didn't pick one." };
  const r = rows[0];
  const score = Math.round(personNameScore(card.name, `${str(r.first_name)} ${str(r.last_name)}`) * 0.9 * 1000) / 1000;
  const base = { origin: "state_license" as const, originUrl: IL_PAGE, method: "name_city" as const, score, checkedAt };
  const detail = { state: "IL", license: str(r.description), expires: str(r.expiration_date), disciplined: str(r.ever_disciplined) };
  return {
    facts: [
      { ...base, field: "license_status", value: (str(r.license_status) ?? "UNKNOWN").toUpperCase(), detail },
      { ...base, field: "name", value: titleCase([str(r.first_name), str(r.last_name)].filter(Boolean).join(" ")) },
    ],
    checked: true,
    note: null,
  };
}

/** Looks a card up in its state's license list. Only people; groups have no license there. */
export async function checkStateLicense(card: LicenseCard, opts: { fetcher?: JsonFetcher; now?: Date } = {}): Promise<LicenseResult> {
  if (card.npiType === "organization") return { facts: [], checked: false, note: null };
  if ((card.state ?? "").toUpperCase() !== "IL") return { facts: [], checked: false, note: `Aeon can't check ${card.state ?? "that state"}'s license list yet.` };
  const description = ilDescription(card.credential, card.taxonomy);
  const last = lastNameFor(card.name);
  if (!description || !last || !card.city) return { facts: [], checked: false, note: "Not enough to look up a license (credential, last name or city)." };
  const fetcher = opts.fetcher ?? jsonFetcher("The Illinois license list (data.illinois.gov)");
  const reply = await fetcher(ilUrl(description, last, card.city));
  return ilFacts(card, reply, (opts.now ?? new Date()).toISOString());
}
