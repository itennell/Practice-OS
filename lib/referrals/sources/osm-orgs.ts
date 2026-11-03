// Organisations near her from OpenStreetMap through the Overpass API (free,
// no key). OpenStreetMap data is © OpenStreetMap contributors under the Open
// Database License (ODbL 1.0): the attribution is shown wherever it appears
// (OSM_ATTRIBUTION in lib/referrals/evidence/merge.ts). Overpass's usage
// policy: low volume, an honest User-Agent, a server timeout, back off on 429.
// So: ONE query per search (every picked type in one union), a 25 s timeout,
// answers cached a day, one request at a time with a pause between, and
// results capped and ranked by distance. Places of worship can be hundreds in
// a city: they are capped harder and only asked for when she picked them or
// her niche lists them (the caller decides, lib/referrals/orgs.ts).
// Never asked for: shelters and other sensitive places (no tags map to them,
// and anything tagged as one is dropped).
import type postgres from "postgres";
import { SOURCE_TYPE_BY_ID } from "../catalog";
import { formatPhone, phoneDigits, zip5 } from "../evidence/normalize";
import type { Fact } from "../evidence/merge";
import { OSM_ATTRIBUTION } from "../evidence/merge";
import { haversineMiles } from "../geo";
import { cachedJson, postKey, waitTurn, withRetry } from "./cache";
import type { FoundOrg } from "./cms-agencies";
import { jsonFetcher, type JsonFetcher } from "./http";
import { OVERPASS_URL } from "./osm";
import { looksSensitive } from "../sensitive";

export { OSM_ATTRIBUTION };

/** At most this many of each type, and in all, nearest first. */
export const OSM_CAP_PER_TYPE = 40;
export const OSM_CAP_WORSHIP = 25;
export const OSM_CAP_TOTAL = 120;
/** Asked of Overpass: enough to rank by distance, never the whole city. */
const OUT_MAX = 400;
const SPACING_MS = 2_000;

type Element = { type: "node" | "way" | "relation"; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

/** The catalog's osm_tags for a type, as [key, values] pairs (any one matching is enough). */
export function tagPairs(type: string): [string, string[]][] {
  const tags = SOURCE_TYPE_BY_ID.get(type)?.osm_tags;
  if (!tags) return [];
  return Object.entries(tags).map(([k, v]) => [k, Array.isArray(v) ? v : [v]]);
}

/** The types OpenStreetMap can find, from the catalog (never a sensitive one). */
export function osmTypes(): string[] {
  return [...SOURCE_TYPE_BY_ID.values()].filter((t) => t.osm_tags && !t.sensitive).map((t) => t.id);
}

const safe = (s: string) => s.replace(/[^a-z0-9_:]/gi, "");

/** One Overpass QL query for every picked type, named places only, within `meters` of a point. */
export function orgQuery(types: string[], point: [number, number], meters: number): string {
  const near = `(around:${Math.round(meters)},${point[0].toFixed(5)},${point[1].toFixed(5)})`;
  const parts: string[] = [];
  for (const type of types) {
    for (const [k, values] of tagPairs(type)) {
      const re = values.map(safe).join("|");
      parts.push(`nwr["${safe(k)}"~"^(${re})$"]["name"]${near};`);
    }
  }
  return `[out:json][timeout:25];(${parts.join("")});out tags center ${OUT_MAX};`;
}

/** An Overpass query for these elements by id ("node/1", "way/2"), to look them up again before saving. */
export function byIdQuery(refs: string[]): string {
  const by: Record<string, string[]> = { node: [], way: [], relation: [] };
  for (const r of refs) {
    const m = /^(node|way|relation)\/(\d{1,15})$/.exec(r);
    if (m) by[m[1]].push(m[2]);
  }
  const parts = Object.entries(by)
    .filter(([, ids]) => ids.length)
    .map(([t, ids]) => `${t}(id:${ids.join(",")});`);
  return `[out:json][timeout:25];(${parts.join("")});out tags center ${OUT_MAX};`;
}

// A place tagged as a shelter or a refuge for survivors is never shown: no street, no pin.
const SENSITIVE_TAG = /shelter|refuge|abuse|victim|women_shelter|domestic/i;

function typeOf(tags: Record<string, string>, types: string[]): string | null {
  for (const type of types) for (const [k, values] of tagPairs(type)) if (tags[k] && values.includes(tags[k])) return type;
  return null;
}

const SAFE_URL = /^https?:\/\/[^\s"'<>]+$/i;

/** True for an element that may be a shelter or a DV/SA agency, by its tags or its name. */
export function sensitiveElement(t: Record<string, string> | undefined): boolean {
  if (!t) return false;
  return SENSITIVE_TAG.test(t.social_facility ?? "") || SENSITIVE_TAG.test(t["social_facility:for"] ?? "") || looksSensitive(t.name, t.operator, t.official_name);
}

/** Overpass's answer with every sensitive element taken out, before anything is cached or read. */
export function dropSensitive(reply: unknown): { elements: Element[] } {
  const elements = ((reply as { elements?: Element[] })?.elements ?? []).filter((e) => !sensitiveElement(e.tags));
  return { elements };
}

/** Overpass elements as organisations of the picked types, nearest first, capped. */
export function parseOsmOrgs(reply: unknown, types: string[], center: [number, number], checkedAt: string, opts: { capPerType?: number; capWorship?: number; capTotal?: number } = {}): { orgs: FoundOrg[]; capped: string[] } {
  const elements = ((reply as { elements?: Element[] })?.elements ?? []).filter((e) => e.tags?.name);
  const found: (FoundOrg & { miles: number })[] = [];
  for (const e of elements) {
    const t = e.tags!;
    if (sensitiveElement(t)) continue;
    const type = typeOf(t, types);
    if (!type) continue;
    const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
    if (!at) continue;
    const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ") || null;
    const phone = phoneDigits(t.phone ?? t["contact:phone"]);
    const website = t.website ?? t["contact:website"] ?? null;
    const ref = `${e.type}/${e.id}`;
    found.push({
      key: `osm:${ref}`,
      type,
      name: t.name.slice(0, 160),
      street,
      city: t["addr:city"] ?? null,
      state: t["addr:state"] ?? null,
      zip: zip5(t["addr:postcode"]) || null,
      phone: phone ? formatPhone(phone) : null,
      website: website && SAFE_URL.test(website) ? website : null,
      ccn: null,
      osmRef: ref,
      lat: at.lat,
      lon: at.lon,
      precision: "address",
      origin: "osm",
      originUrl: `https://www.openstreetmap.org/${ref}`,
      checkedAt,
      miles: haversineMiles(center, [at.lat, at.lon]),
    });
  }
  found.sort((a, b) => a.miles - b.miles || a.name.localeCompare(b.name));
  const perType = new Map<string, number>();
  const capped = new Set<string>();
  const out: FoundOrg[] = [];
  for (const o of found) {
    const cap = o.type === "clergy" ? (opts.capWorship ?? OSM_CAP_WORSHIP) : (opts.capPerType ?? OSM_CAP_PER_TYPE);
    const n = perType.get(o.type) ?? 0;
    if (n >= cap || out.length >= (opts.capTotal ?? OSM_CAP_TOTAL)) {
      capped.add(o.type);
      continue;
    }
    perType.set(o.type, n + 1);
    const { miles: _miles, ...org } = o;
    void _miles;
    out.push(org);
  }
  return { orgs: out, capped: [...capped] };
}

/** What OpenStreetMap says about a place, as card facts, each carrying the ODbL attribution. */
export function osmOrgFacts(org: FoundOrg): Fact[] {
  const base = { origin: "osm" as const, originUrl: org.originUrl, method: "name_address" as const, score: 1, checkedAt: org.checkedAt, detail: { attribution: OSM_ATTRIBUTION, osm: org.osmRef } };
  const facts: Fact[] = [{ ...base, field: "name", value: org.name }];
  if (org.street && org.zip) facts.push({ ...base, field: "address", value: [org.street, org.city, [org.state, org.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ") });
  if (org.phone) facts.push({ ...base, field: "phone", value: org.phone });
  if (org.website) facts.push({ ...base, field: "website", value: org.website });
  return facts;
}

/** After a 429, a busy server or no answer, Overpass is asked again after these waits (each still after its 2-second turn). */
export const OVERPASS_RETRY_MS = [5_000, 15_000] as const;

type Deps = {
  fetcher?: JsonFetcher;
  sql?: postgres.Sql | null;
  now?: () => Date;
  /** Told when an answer couldn't be kept in referral_fetch_cache (it is still used). */
  onStoreError?: (err: unknown) => void;
  /** Waits before asking again (default OVERPASS_RETRY_MS); tests pass [] or a fake sleep. */
  retryDelaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<unknown>;
};

async function overpass(query: string, deps: Deps): Promise<unknown> {
  const fetcher = deps.fetcher ?? jsonFetcher("OpenStreetMap (Overpass)", 30_000);
  const body = new URLSearchParams({ data: query }).toString();
  return cachedJson(
    postKey(OVERPASS_URL, query),
    () =>
      withRetry(
        async () => {
          await waitTurn("overpass-api.de", SPACING_MS);
          // Sensitive places are dropped here, so their raw JSON is never cached or stored.
          return dropSensitive(await fetcher(OVERPASS_URL, { method: "POST", body, headers: { "Content-Type": "application/x-www-form-urlencoded" } }));
        },
        deps.retryDelaysMs ?? OVERPASS_RETRY_MS,
        deps.sleep,
      ),
    { sql: deps.sql, host: "overpass-api.de", source: "OpenStreetMap (Overpass)", onStoreError: deps.onStoreError },
  );
}

/** One Overpass question for every picked type around a point. */
export async function searchOsmOrgs(types: string[], center: [number, number], miles: number, deps: Deps = {}): Promise<{ orgs: FoundOrg[]; capped: string[] }> {
  const asked = types.filter((t) => tagPairs(t).length && !SOURCE_TYPE_BY_ID.get(t)?.sensitive);
  if (asked.length === 0) return { orgs: [], capped: [] };
  const reply = await overpass(orgQuery(asked, center, Math.min(miles, 10) * 1609.34), deps);
  return parseOsmOrgs(reply, asked, center, (deps.now?.() ?? new Date()).toISOString());
}

/** Places by OpenStreetMap id, looked up again before they are saved (the page sends ids only). */
export async function osmByRef(refs: string[], types: string[], center: [number, number], deps: Deps = {}): Promise<FoundOrg[]> {
  const ok = refs.filter((r) => /^(node|way|relation)\/\d{1,15}$/.test(r));
  if (ok.length === 0) return [];
  const reply = await overpass(byIdQuery(ok), deps);
  return parseOsmOrgs(reply, types, center, (deps.now?.() ?? new Date()).toISOString(), { capPerType: 50, capWorship: 50, capTotal: 50 }).orgs.filter((o) => ok.includes(o.osmRef!));
}
