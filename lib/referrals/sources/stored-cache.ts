// The map's two outside questions, kept in practice_os.referral_fetch_cache
// (023) like the CMS and OpenStreetMap answers (./cache.ts), so a search the
// app already ran answers from the database, even after a restart, and
// `npm run demo:warm` can ask once before a recording:
//   - the NPI Registry: each search page (one URL) for a day, slimmed to the
//     fields lib/referrals/nppes.ts parseResult reads, so a 200-result page fits.
//     Before anything is kept, every sensitive result (a DV/SA agency or shelter,
//     by NUCC code or name, lib/referrals/sensitive.ts) and anyone NPPES lists at
//     the same street on that page is taken out, the way Overpass answers are
//     (osm-orgs.ts dropSensitive): no shelter's name or street is ever stored;
//   - the Census geocoder: each provider address's point (or "no match") for 30
//     days, keyed by a hash of the address. Offices don't move often.
// These rows have their own prune (past their lifetime, on each write); the
// website-page prune (lib/referrals/email/fetch.ts) skips them by key prefix.
// Server only: lib/referrals/nppes.ts is also read in the browser, so the
// database stays out of it. Only public directory answers are stored, never
// anything about a client.
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { cachedFetch, fetchNppes, type Fetcher, type NppesResponse, type NppesResult } from "../nppes";
import { addressKey, geocodeAddresses, type Address, type Point } from "../geocode";
import { isSensitiveSource, siteHashes } from "../sensitive";
import { cachedJson, DAY_MS } from "./cache";
import { CENSUS_KEY_PREFIX, NPPES_KEY_PREFIX } from "./stored-keys";

export const NPPES_STORE_MS = DAY_MS;
export const GEOCODE_STORE_MS = 30 * DAY_MS;

/** Told when an answer couldn't be kept (the search still gets it); demo:warm lists these. */
export type StoreErrorSink = (what: string) => void;

type Address0 = NonNullable<NppesResult["addresses"]>[number];

const slimAddress = (a: Address0): Address0 => ({
  address_1: a.address_1,
  address_2: a.address_2,
  address_purpose: a.address_purpose,
  city: a.city,
  state: a.state,
  postal_code: a.postal_code,
  telephone_number: a.telephone_number,
  fax_number: a.fax_number,
});

const resultNames = (r: NppesResult) => [
  r.basic?.organization_name,
  [r.basic?.first_name, r.basic?.last_name].filter(Boolean).join(" ") || null,
  ...(r.other_names ?? []).map((o) => o.organization_name),
];

/** A DV/SA agency or shelter by any of its NUCC codes or names (its legal name or a DBA). */
export function sensitiveResult(r: NppesResult): boolean {
  const names = resultNames(r);
  return (
    (r.taxonomies ?? []).some((t) => isSensitiveSource({ taxonomy: t.code })) ||
    names.some((n) => isSensitiveSource({ name: n ?? null }))
  );
}

const siteKeys = (r: NppesResult) => [...(r.addresses ?? []), ...(r.practiceLocations ?? [])].flatMap((a) => siteHashes([a.address_1, a.address_2].filter(Boolean).join(" "), a.postal_code));

/**
 * Only what parseResult reads (a full NPPES page is about 1 MB, this is a
 * fraction), and never a sensitive result or anyone at its street on the page.
 */
export function slimNppes(res: NppesResponse): NppesResponse {
  const out: NppesResponse = {};
  if (res.result_count !== undefined) out.result_count = res.result_count;
  if (res.Errors) out.Errors = res.Errors.map((e) => ({ description: e.description }));
  if (res.results) {
    const hidden = res.results.filter(sensitiveResult);
    const sites = new Set(hidden.flatMap(siteKeys));
    const kept = res.results.filter((r) => !hidden.includes(r) && !siteKeys(r).some((h) => sites.has(h)));
    out.results = kept.map((r) => ({
      number: r.number,
      enumeration_type: r.enumeration_type,
      basic: {
        status: r.basic?.status,
        first_name: r.basic?.first_name,
        last_name: r.basic?.last_name,
        credential: r.basic?.credential,
        organization_name: r.basic?.organization_name,
        last_updated: r.basic?.last_updated,
        authorized_official_first_name: r.basic?.authorized_official_first_name,
        authorized_official_last_name: r.basic?.authorized_official_last_name,
      },
      addresses: (r.addresses ?? []).filter((a) => a.address_purpose === "LOCATION").map(slimAddress),
      practiceLocations: (r.practiceLocations ?? []).map(slimAddress),
      taxonomies: (r.taxonomies ?? []).map((t) => ({ code: t.code, desc: t.desc, primary: t.primary })),
      other_names: (r.other_names ?? []).filter((o) => o.code === "3").map((o) => ({ organization_name: o.organization_name, code: o.code })),
    }));
  }
  return out;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Removes this prefix's rows past their lifetime. Run on each write; a failure is reported, never thrown. */
async function prune(sql: postgres.Sql, prefix: string, ttlMs: number, now: number, onError?: StoreErrorSink) {
  await sql`
    delete from practice_os.referral_fetch_cache
     where left(url, ${prefix.length}) = ${prefix} and fetched_at < ${new Date(now - ttlMs)}`.catch((err) =>
    onError?.(`Couldn't clear old saved answers: ${message(err)}`),
  );
}

/** NPPES search pages from the database when asked within a day, else from the registry (and kept). */
export function storedNppesFetcher(sql: postgres.Sql | null, fetcher: Fetcher = fetchNppes, onError?: StoreErrorSink, now: () => number = Date.now): Fetcher {
  return cachedFetch(
    (url) =>
      cachedJson(
        url,
        async () => {
          const page = slimNppes(await fetcher(url));
          // A fresh answer is about to be written: drop this kind's rows past their day first.
          if (sql) await prune(sql, NPPES_KEY_PREFIX, NPPES_STORE_MS, now(), onError);
          return page;
        },
        {
          sql,
          now,
          ttlMs: NPPES_STORE_MS,
          source: "The NPI Registry",
          onStoreError: (err) => onError?.(`Couldn't keep an NPI Registry page: ${message(err)}`),
        },
      ) as Promise<NppesResponse>,
  );
}

export function geocodeKey(a: Address): string {
  return `${CENSUS_KEY_PREFIX}${createHash("sha256").update(addressKey(a)).digest("hex")}`;
}

/** geocodeAddresses, with each address's answer kept in the database for 30 days. */
export function storedGeocoder(
  sql: postgres.Sql | null,
  geocode: typeof geocodeAddresses = geocodeAddresses,
  now: () => number = Date.now,
  onError?: StoreErrorSink,
): typeof geocodeAddresses {
  return async (addresses, opts) => {
    if (!sql || addresses.length === 0) return geocode(addresses, opts);
    const out = new Map<string, Point | null>();
    const keyOf = new Map(addresses.map((a) => [addressKey(a), geocodeKey(a)]));
    const rows = await sql<{ url: string; body: string | null; fetched_at: Date }[]>`
      select url, body, fetched_at from practice_os.referral_fetch_cache
       where url = any(${[...new Set(keyOf.values())]}) and status = 200`.catch((err) => {
      onError?.(`Couldn't read saved map points: ${message(err)}`);
      return [];
    });
    const stored = new Map<string, Point | null>();
    for (const r of rows) {
      if (now() - new Date(r.fetched_at).getTime() >= GEOCODE_STORE_MS || r.body === null) continue;
      try {
        const v = JSON.parse(r.body) as unknown;
        if (v === null || (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number"))) stored.set(r.url, v as Point | null);
      } catch {
        // A bad row is asked again.
      }
    }
    const misses: Address[] = [];
    for (const a of addresses) {
      const k = addressKey(a);
      const hash = keyOf.get(k)!;
      if (stored.has(hash)) out.set(k, stored.get(hash)!);
      else misses.push(a);
    }
    if (misses.length === 0) return out;
    const found = await geocode(misses, opts);
    const save: { url: string; status: number; body: string; fetched_at: Date }[] = [];
    const seen = new Set<string>();
    for (const a of misses) {
      const k = addressKey(a);
      if (!found.has(k)) continue; // Not asked (over the batch cap) or the geocoder failed: nothing kept.
      out.set(k, found.get(k)!);
      const url = keyOf.get(k)!;
      if (seen.has(url)) continue;
      seen.add(url);
      save.push({ url, status: 200, body: JSON.stringify(found.get(k) ?? null), fetched_at: new Date(now()) });
    }
    if (save.length) await prune(sql, CENSUS_KEY_PREFIX, GEOCODE_STORE_MS, now(), onError);
    for (let i = 0; i < save.length; i += 500) {
      await sql`
        insert into practice_os.referral_fetch_cache ${sql(save.slice(i, i + 500))}
        on conflict (url) do update set status = 200, etag = null, last_modified = null, body = excluded.body, fetched_at = excluded.fetched_at`.catch((err) =>
        onError?.(`Couldn't keep ${save.slice(i, i + 500).length} map points: ${message(err)}`),
      );
    }
    return out;
  };
}
