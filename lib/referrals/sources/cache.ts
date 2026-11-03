// Polite asking for the discovery sources (CMS Provider Data Catalog,
// Overpass): answers are kept for a day in practice_os.referral_fetch_cache
// (023) so the same search never asks twice, and each host gets its turn
// (one request at a time, spaced) so a busy morning never hammers a free API.
// Without a database (tests, a broken connection) a small in-memory cache is used.
import { createHash } from "node:crypto";
import type postgres from "postgres";
import { SourceUnavailable } from "./http";

export const DAY_MS = 24 * 3600 * 1000;
const MEMORY_MAX = 200;
const BODY_MAX = 600_000;
const memory = new Map<string, { body: string; at: number }>();
const nextSlot = new Map<string, number>();
/** A host that said 429 or 503 is left alone this long; a failed question isn't asked again for FAIL_MS. */
export const COOL_MS = 3 * 60 * 1000;
export const FAIL_MS = 2 * 60 * 1000;
const cooling = new Map<string, number>();
const failed = new Map<string, number>();

/** A cache key for a POST (Overpass): the endpoint plus a hash of the query, under 2,000 characters. */
export function postKey(url: string, body: string): string {
  return `${url}#sha256=${createHash("sha256").update(body).digest("hex")}`;
}

/** Waits for this host's next turn: at least `spacingMs` after its last request. */
export async function waitTurn(host: string, spacingMs: number, now = Date.now, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<void> {
  const t = now();
  const slot = Math.max(t, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + spacingMs);
  if (slot > t) await sleep(slot - t);
}

export function clearSourceCache() {
  memory.clear();
  nextSlot.clear();
  cooling.clear();
  failed.clear();
}

/** Until when this host is being left alone after a 429 or 503 (0 when it isn't). */
export function coolingUntil(host: string): number {
  return cooling.get(host) ?? 0;
}

/**
 * The cached answer for `key` when younger than `ttlMs`, else `load()` (and
 * keep what it returns). A failed load is never cached.
 */
export async function cachedJson(
  key: string,
  load: () => Promise<unknown>,
  opts: { ttlMs?: number; sql?: postgres.Sql | null; now?: () => number; /** Backs off this host after a 429 or 503. */ host?: string; source?: string } = {},
): Promise<unknown> {
  const ttl = opts.ttlMs ?? DAY_MS;
  const now = opts.now ?? Date.now;
  const sql = opts.sql ?? null;
  const fresh = (at: number) => now() - at < ttl;
  const hit = memory.get(key);
  if (hit && fresh(hit.at)) return JSON.parse(hit.body);
  if (sql && key.length <= 2000) {
    const [row] = await sql<{ body: string | null; fetched_at: Date }[]>`
      select body, fetched_at from practice_os.referral_fetch_cache where url = ${key} and status = 200`.catch(() => []);
    if (row?.body && fresh(new Date(row.fetched_at).getTime())) {
      memory.set(key, { body: row.body, at: new Date(row.fetched_at).getTime() });
      return JSON.parse(row.body);
    }
  }
  // Polite after trouble: a host that said 429/503 is left alone a few minutes, and a question that just failed isn't asked again at once.
  const source = opts.source ?? opts.host ?? "That source";
  if (opts.host && coolingUntil(opts.host) > now()) throw new SourceUnavailable(source, 429);
  if ((failed.get(key) ?? 0) > now()) throw new SourceUnavailable(source, null);
  let value: unknown;
  try {
    value = await load();
  } catch (err) {
    failed.set(key, now() + FAIL_MS);
    if (failed.size > MEMORY_MAX) failed.delete(failed.keys().next().value!);
    if (opts.host && err instanceof SourceUnavailable && (err.status === 429 || err.status === 503 || err.status === 504)) cooling.set(opts.host, now() + COOL_MS);
    throw err;
  }
  const body = JSON.stringify(value);
  if (body.length <= BODY_MAX) {
    memory.delete(key);
    memory.set(key, { body, at: now() });
    while (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
    if (sql && key.length <= 2000) {
      await sql`
        insert into practice_os.referral_fetch_cache (url, status, body, fetched_at)
        values (${key}, 200, ${body}, ${new Date(now())})
        on conflict (url) do update set status = 200, etag = null, last_modified = null, body = excluded.body, fetched_at = excluded.fetched_at`.catch(() => {});
    }
  }
  return value;
}
