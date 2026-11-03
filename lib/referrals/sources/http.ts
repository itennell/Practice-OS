// Asking the public sources (CMS, the state license list, OpenStreetMap):
// an honest User-Agent, a timeout, and a refusal (403, 429, 5xx) reported as
// "this source is unavailable right now", never as "this provider isn't there".

export const USER_AGENT = "Practice-OS/0.1 (+https://github.com/itennell/Practice-OS)";

export class SourceUnavailable extends Error {
  constructor(
    readonly source: string,
    readonly status: number | null,
    /** From a Retry-After header in seconds (a 429 or 503), when the source sent one. */
    readonly retryAfterMs: number | null = null,
  ) {
    super(`${source} didn't answer${status ? ` (${status})` : ""}. Aeon will try again later.`);
  }
}

export type JsonFetcher = (url: string, init?: { method?: string; body?: string; headers?: Record<string, string>; /** Shorter than the fetcher's own timeout, e.g. to keep a deadline. */ timeoutMs?: number }) => Promise<unknown>;

export function jsonFetcher(source: string, timeoutMs = 15_000): JsonFetcher {
  return async (url, init) => {
    let res: Response;
    try {
      res = await fetch(url, {
        method: init?.method ?? "GET",
        body: init?.body,
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...init?.headers },
        signal: AbortSignal.timeout(Math.max(1, Math.min(timeoutMs, init?.timeoutMs ?? timeoutMs))),
      });
    } catch {
      throw new SourceUnavailable(source, null);
    }
    if (!res.ok) throw new SourceUnavailable(source, res.status, retryAfterMs(res.headers.get("retry-after")));
    return res.json();
  };
}

/** A Retry-After header given in seconds, as milliseconds (an HTTP date or nonsense: null). */
export function retryAfterMs(header: string | null): number | null {
  if (!header || !/^\d{1,6}$/.test(header.trim())) return null;
  return Number(header.trim()) * 1000;
}

/** Text from an outside source, trimmed, or null when empty. */
export function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
