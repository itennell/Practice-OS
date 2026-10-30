// OpenStreetMap through the Overpass API (free, no key; ODbL, "© OpenStreetMap
// contributors"). Asks for health places with the provider's name near the
// card's address; a mapped practice may carry its website, phone and email.
// Overpass's policy: low volume, an honest User-Agent, back off on 429.
import type { Fact } from "../evidence/merge";
import { matchCandidate, NAME_MIN, orgNameScore, personNameScore } from "../evidence/match";
import { addressLine, formatPhone, normalizeName, phoneDigits } from "../evidence/normalize";
import { haversineMiles } from "../geo";
import { jsonFetcher, type JsonFetcher } from "./http";

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

type Element = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** The word to search names for: a person's last name, or a group's first two words. */
export function searchWord(name: string, isOrg: boolean): string | null {
  const word = isOrg
    ? name.replace(/[^A-Za-z0-9 ]/g, " ").trim().split(/\s+/).slice(0, 2).join(" ")
    : normalizeName(name).lasts.at(-1) ?? "";
  return word.length >= 3 ? word : null;
}

/** Overpass QL for health places whose name contains `word`, within `meters` of a point. */
export function overpassQuery(word: string, point: [number, number], meters: number): string {
  const re = word.replace(/[^A-Za-z0-9 ]/g, "");
  const near = `(around:${Math.round(meters)},${point[0].toFixed(5)},${point[1].toFixed(5)})`;
  return `[out:json][timeout:20];(nwr["healthcare"]["name"~"${re}",i]${near};nwr["amenity"~"^(doctors|clinic|hospital)$"]["name"~"${re}",i]${near};nwr["office"~"^(therapist|psychologist|physician)$"]["name"~"${re}",i]${near};);out tags center 20;`;
}

const SAFE_URL = /^https?:\/\/[^\s"'<>]+$/i;

/** The best mapped place for this card, as facts. */
export function osmFacts(
  card: { name: string; isOrg: boolean; street: string | null; zip: string | null; phone: string | null; point: [number, number] | null },
  reply: unknown,
  checkedAt: string,
): Fact[] {
  const elements = ((reply as { elements?: Element[] })?.elements ?? []).filter((e) => e.tags?.name);
  let best: { e: Element; score: number; method: "name_address" } | null = null;
  for (const e of elements) {
    const t = e.tags!;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;
    const other = { name: t.name, organization: t.name, isOrg: card.isOrg, street, zip: t["addr:postcode"] ?? null, phone: t.phone ?? t["contact:phone"] ?? null };
    const m = matchCandidate({ name: card.name, organization: card.name, isOrg: card.isOrg, street: card.street, zip: card.zip, phone: card.phone }, other);
    let score = m?.score ?? 0;
    // A mapped place without an address counts when it sits on the card's spot (about 500 feet).
    const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!m && card.point && at && haversineMiles(card.point, [at.lat, at.lon]) < 0.1) {
      const nameScore = card.isOrg ? orgNameScore(card.name, t.name) : personNameScore(card.name, t.name);
      if (nameScore >= NAME_MIN) score = Math.round(nameScore * 950) / 1000;
    }
    if (score > (best?.score ?? 0)) best = { e, score, method: "name_address" };
  }
  if (!best) return [];
  const t = best.e.tags!;
  const page = `https://www.openstreetmap.org/${best.e.type}/${best.e.id}`;
  const base = { origin: "osm" as const, originUrl: page, method: best.method, score: best.score, checkedAt };
  const facts: Fact[] = [{ ...base, field: "name", value: t.name }];
  const website = t.website ?? t["contact:website"];
  if (website && SAFE_URL.test(website)) facts.push({ ...base, field: "website", value: website });
  const phone = phoneDigits(t.phone ?? t["contact:phone"]);
  if (phone) facts.push({ ...base, field: "phone", value: formatPhone(phone) });
  const email = (t.email ?? t["contact:email"] ?? "").trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(email)) facts.push({ ...base, field: "email", value: email, detail: { label: "on OpenStreetMap" } });
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  if (street && t["addr:postcode"]) facts.push({ ...base, field: "address", value: addressLine(street, t["addr:city"], t["addr:state"], t["addr:postcode"]) });
  return facts;
}

/** Looks the card up on OpenStreetMap near its address (or its ZIP center, in a wider circle). */
export async function checkOsm(
  card: { name: string; isOrg: boolean; street: string | null; zip: string | null; phone: string | null; point: [number, number] | null; exact: boolean },
  opts: { fetcher?: JsonFetcher; now?: Date } = {},
): Promise<{ facts: Fact[]; checked: boolean }> {
  const word = searchWord(card.name, card.isOrg);
  if (!word || !card.point) return { facts: [], checked: false };
  const fetcher = opts.fetcher ?? jsonFetcher("OpenStreetMap (Overpass)", 25_000);
  const query = overpassQuery(word, card.point, card.exact ? 400 : 2500);
  const reply = await fetcher(OVERPASS_URL, {
    method: "POST",
    body: new URLSearchParams({ data: query }).toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return { facts: osmFacts(card, reply, (opts.now ?? new Date()).toISOString()), checked: true };
}
