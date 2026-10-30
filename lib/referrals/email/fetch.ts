// Reading a practice's own website, politely: an honest User-Agent, at least
// one second between requests to the same site, 5 seconds at most, and only
// web pages (HTML or plain text, 600 KB at most). Answers are kept so a
// re-check asks "has it changed?" (ETag / Last-Modified) instead of fetching
// again: robots.txt for a day (RFC 9309 §2.4), pages for a week. With `sql` the
// cache is practice_os.referral_fetch_cache; without it, a Map in memory.
//
// It refuses anything that isn't a public web address (localhost, private
// networks, bare IP addresses, .local and .internal names), checks the
// address the name points to, and follows at most 5 redirects itself,
// checking each new address the same way, so a website can't send Aeon into
// her own computer or network.
import { lookup as dnsLookup } from "node:dns/promises";
import type postgres from "postgres";

export const USER_AGENT = "Practice-OS/0.1 (+https://github.com/itennell/Practice-OS)";
const SPACING_MS = 1000;
const TIMEOUT_MS = 5000;
const MAX_BODY = 600_000;
const MAX_REDIRECTS = 5;
const ROBOTS_TTL = 24 * 60 * 60 * 1000;
const PAGE_TTL = 7 * 24 * 60 * 60 * 1000;

export type FetchResult = {
  url: string;
  /** Where the answer came from after redirects. */
  finalUrl: string;
  /** HTTP status; 0 when there was no answer (refused, timed out, unreachable). */
  status: number;
  body: string;
  fromCache: boolean;
  /** Plain words when something went wrong. */
  error?: string;
};

export type PoliteFetchOpts = {
  fetcher?: typeof fetch;
  /** Milliseconds since 1970, for the cache and the spacing between requests. */
  now?: () => number;
  sql?: postgres.Sql;
  sleep?: (ms: number) => Promise<void>;
  /** The addresses a host name points to (default: the system's DNS). */
  lookup?: (host: string) => Promise<string[]>;
  timeoutMs?: number;
};

type CacheEntry = { status: number; etag: string | null; lastModified: string | null; body: string; fetchedAt: number };

const memoryCache = new Map<string, CacheEntry>();
const MEMORY_MAX = 500;
const nextSlot = new Map<string, number>();

/** Clears the in-memory cache and the per-site spacing (tests). */
export function resetPoliteFetch(): void {
  memoryCache.clear();
  nextSlot.clear();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function defaultLookup(host: string): Promise<string[]> {
  const answers = await dnsLookup(host, { all: true });
  return answers.map((a) => a.address);
}

function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\d+$/.test(host) || /^0x/i.test(host);
}

/** A private, loopback, link-local or otherwise not-public address. */
export function isPrivateAddress(ip: string): boolean {
  const v = ip.toLowerCase().replace(/^::ffff:/, "");
  const m = v.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  return v === "::" || v === "::1" || /^f[cd]/.test(v) || /^fe[89ab]/.test(v);
}

/** Why a URL may not be fetched, or null when it's a public http(s) web address. */
export function unsafeUrlReason(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "not a web address";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "only http and https pages are read";
  if (url.username || url.password) return "addresses with a sign-in in them are not read";
  if (url.port && url.port !== "80" && url.port !== "443") return "only the usual web ports are read";
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (isIpLiteral(host)) return "bare IP addresses are not read";
  if (!host.includes(".")) return "not a public web address";
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "not a public web address";
  }
  return null;
}

function hostOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function ttlFor(url: string): number {
  return new URL(url).pathname === "/robots.txt" ? ROBOTS_TTL : PAGE_TTL;
}

async function readCache(url: string, sql?: postgres.Sql): Promise<CacheEntry | null> {
  if (!sql) return memoryCache.get(url) ?? null;
  const [row] = await sql<{ status: number; etag: string | null; last_modified: string | null; body: string | null; fetched_at: Date }[]>`
    select status, etag, last_modified, body, fetched_at from practice_os.referral_fetch_cache where url = ${url}`;
  if (!row) return null;
  return { status: row.status, etag: row.etag, lastModified: row.last_modified, body: row.body ?? "", fetchedAt: new Date(row.fetched_at).getTime() };
}

async function writeCache(url: string, entry: CacheEntry, sql?: postgres.Sql): Promise<void> {
  if (!sql) {
    memoryCache.delete(url);
    memoryCache.set(url, entry);
    while (memoryCache.size > MEMORY_MAX) memoryCache.delete(memoryCache.keys().next().value!);
    return;
  }
  if (url.length > 2000) return;
  const fetchedAt = new Date(entry.fetchedAt);
  await sql`
    insert into practice_os.referral_fetch_cache (url, status, etag, last_modified, body, fetched_at)
    values (${url}, ${entry.status}, ${entry.etag}, ${entry.lastModified}, ${entry.body}, ${fetchedAt})
    on conflict (url) do update set status = excluded.status, etag = excluded.etag,
      last_modified = excluded.last_modified, body = excluded.body, fetched_at = excluded.fetched_at`;
}

/** Waits until this site's next turn: at least a second after the last request to it. */
async function waitTurn(host: string, now: () => number, sleep: (ms: number) => Promise<void>): Promise<void> {
  const t = now();
  const slot = Math.max(t, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + SPACING_MS);
  if (slot > t) await sleep(slot - t);
}

/** Reads at most MAX_BODY bytes of the answer and stops there. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return (await res.text()).slice(0, MAX_BODY);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = MAX_BODY - size;
    chunks.push(value.length > room ? value.slice(0, room) : value);
    size += Math.min(value.length, room);
  }
  await reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.length;
  }
  return new TextDecoder().decode(all).slice(0, MAX_BODY);
}

function isWebPage(contentType: string | null): boolean {
  if (!contentType) return true; // many small sites send none; the body is still only read as text
  const type = contentType.split(";")[0].trim().toLowerCase();
  return type === "text/html" || type === "text/plain";
}

export async function politeFetch(url: string, opts: PoliteFetchOpts = {}): Promise<FetchResult> {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? defaultSleep;
  const lookup = opts.lookup ?? defaultLookup;
  const fail = (error: string, finalUrl = url): FetchResult => ({ url, finalUrl, status: 0, body: "", fromCache: false, error });

  const refused = unsafeUrlReason(url);
  if (refused) return fail(`refused: ${refused}`);

  const cached = await readCache(url, opts.sql).catch(() => null);
  if (cached && now() - cached.fetchedAt < ttlFor(url)) {
    return { url, finalUrl: url, status: cached.status, body: cached.body, fromCache: true };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_MS);
  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      const reason = unsafeUrlReason(current);
      if (reason) return fail(`refused: ${reason}`, current);
      const host = hostOf(current);
      let addresses: string[];
      try {
        addresses = await lookup(host);
      } catch {
        return fail("the site's address couldn't be found", current);
      }
      if (!addresses.length || addresses.some(isPrivateAddress)) return fail("refused: not a public web address", current);

      const headers: Record<string, string> = { "User-Agent": USER_AGENT, Accept: "text/html, text/plain;q=0.9" };
      if (hop === 0 && cached) {
        if (cached.etag) headers["If-None-Match"] = cached.etag;
        if (cached.lastModified) headers["If-Modified-Since"] = cached.lastModified;
      }
      await waitTurn(host, now, sleep);
      const res = await fetcher(current, { headers, redirect: "manual", signal: controller.signal });

      if (res.status === 304 && hop === 0 && cached) {
        await writeCache(url, { ...cached, fetchedAt: now() }, opts.sql).catch(() => {});
        return { url, finalUrl: url, status: cached.status, body: cached.body, fromCache: true };
      }
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location) return fail("a redirect without an address", current);
        if (hop >= MAX_REDIRECTS) return fail("too many redirects", current);
        current = new URL(location, current).toString();
        continue;
      }
      if (!isWebPage(res.headers.get("content-type"))) {
        return { url, finalUrl: current, status: res.status, body: "", fromCache: false, error: "not a web page" };
      }
      const body = await readCapped(res);
      const entry: CacheEntry = {
        status: res.status,
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        body,
        fetchedAt: now(),
      };
      // Pages that answered, and robots.txt answers that say "there isn't one", are kept; server errors are not.
      if (res.status < 500) await writeCache(url, entry, opts.sql).catch(() => {});
      return { url, finalUrl: current, status: res.status, body, fromCache: false };
    }
  } catch (e) {
    const timedOut = controller.signal.aborted;
    return fail(timedOut ? "the site took too long to answer" : `the site couldn't be reached (${e instanceof Error ? e.message : "error"})`);
  } finally {
    clearTimeout(timer);
  }
}
