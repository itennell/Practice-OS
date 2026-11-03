// demo:warm follow-ups (2026-11-03): Overpass is asked again after a short wait when it
// is rate limited, busy or silent, within a deadline that keeps every in-app search
// inside its route's maxDuration; a failed chain cools the host; and a CMS or
// OpenStreetMap answer that couldn't be kept in referral_fetch_cache is reported
// (demo:warm's notKept) instead of swallowed. Recorded data only; no network, no database.
import type postgres from "postgres";
import { afterEach, describe, expect, it, vi } from "vitest";
import hospice from "./fixtures/referrals/sources/cms-hospice.json" with { type: "json" };
import osmOrgs from "./fixtures/referrals/sources/osm-orgs.json" with { type: "json" };
import { clearSourceCache, cool, COOL_MS, coolingUntil, MIN_ATTEMPT_MS, RETRY_AFTER_MAX_MS, withRetry } from "../lib/referrals/sources/cache";
import { retryAfterMs, SourceUnavailable, type JsonFetcher } from "../lib/referrals/sources/http";
import { OVERPASS_DEADLINE_MS, OVERPASS_RETRY_MS, searchOsmOrgs } from "../lib/referrals/sources/osm-orgs";
import { searchCmsAgencies } from "../lib/referrals/sources/cms-agencies";
import { discoverOrgs } from "../lib/referrals/orgs";
import { WARM_OSM_DEADLINE_MS } from "../lib/demo-warm";

const CENTER: [number, number] = [41.9214, -87.6513];
const HOST = "test-host.example";
const noSleep = vi.fn(async () => {});
const fail = (status: number | null, retryAfter: number | null = null) => {
  throw new SourceUnavailable("Overpass", status, retryAfter);
};

/** A database whose reads come back empty and whose writes fail. */
function brokenSql(): postgres.Sql {
  const sql = (strings: TemplateStringsArray) =>
    strings.join("?").trim().startsWith("select") ? Promise.resolve([]) : Promise.reject(new Error("the pooler is busy"));
  return sql as unknown as postgres.Sql;
}

afterEach(() => clearSourceCache());

describe("withRetry", () => {
  it("asks again after each wait when rate limited (429), busy (503) or silent, then gives up", async () => {
    for (const status of [429, 503, null]) {
      const sleep = vi.fn((ms: number) => Promise.resolve(ms));
      const ask = vi.fn(async () => fail(status));
      await expect(withRetry(ask, { delaysMs: [5, 15], sleep })).rejects.toBeInstanceOf(SourceUnavailable);
      expect(ask).toHaveBeenCalledTimes(3);
      expect(sleep.mock.calls.map((c) => c[0])).toEqual([5, 15]);
    }
  });

  it("stops as soon as one answers", async () => {
    let n = 0;
    const ask = vi.fn(async () => (n++ === 0 ? fail(503) : { ok: true }));
    await expect(withRetry(ask, { delaysMs: [5, 15], sleep: noSleep })).resolves.toEqual({ ok: true });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("doesn't retry 504 (a query too heavy), 502, a refusal (403) or a bug", async () => {
    for (const status of [504, 502, 403]) {
      const ask = vi.fn(async () => fail(status));
      await expect(withRetry(ask, { delaysMs: [5], sleep: noSleep })).rejects.toBeInstanceOf(SourceUnavailable);
      expect(ask).toHaveBeenCalledTimes(1);
    }
    const bug = vi.fn(async () => {
      throw new TypeError("oops");
    });
    await expect(withRetry(bug, { delaysMs: [5], sleep: noSleep })).rejects.toBeInstanceOf(TypeError);
    expect(bug).toHaveBeenCalledTimes(1);
  });

  it("waits out a Retry-After the source sent, but not a long one", async () => {
    const sleep = vi.fn((ms: number) => Promise.resolve(ms));
    let n = 0;
    await withRetry(async () => (n++ === 0 ? fail(429, 8_000) : 1), { delaysMs: [5], sleep });
    expect(sleep).toHaveBeenCalledWith(8_000);
    const long = vi.fn(async () => fail(429, RETRY_AFTER_MAX_MS + 1));
    await expect(withRetry(long, { delaysMs: [5], sleep })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(long).toHaveBeenCalledTimes(1);
  });

  it("reads Retry-After in seconds only", () => {
    expect(retryAfterMs("12")).toBe(12_000);
    expect(retryAfterMs(" 3 ")).toBe(3_000);
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("the deadline", () => {
  it("no sleep starts that, with a short attempt after it, would pass the deadline", async () => {
    let t = 0;
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const ask = vi.fn(async () => {
      t += 1_000;
      return fail(429);
    });
    // 1 s attempt, 5 s wait (1+5+3 <= 12), 1 s attempt at 6-7 s, then 15 s doesn't fit.
    await expect(withRetry(ask, { delaysMs: [5_000, 15_000], deadlineAt: 12_000, sleep, now: () => t })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5_000]);
    expect(t).toBeLessThanOrEqual(12_000);
  });

  it("each attempt is told how long is left", async () => {
    let t = 0;
    const left: number[] = [];
    await expect(
      withRetry(
        async (msLeft) => {
          left.push(msLeft);
          t += 2_000;
          return fail(null);
        },
        { delaysMs: [5_000], deadlineAt: 20_000, sleep: async (ms) => void (t += ms), now: () => t },
      ),
    ).rejects.toBeInstanceOf(SourceUnavailable);
    expect(left).toEqual([20_000, 13_000]);
  });

  it("an Overpass search in the app is over within 40 s from its start, even when every answer is a timeout", async () => {
    let t = Date.now();
    const clock = () => t;
    const timeouts: (number | undefined)[] = [];
    // Every attempt uses up the whole time it's given, then fails with no answer.
    const fetcher: JsonFetcher = vi.fn(async (_url, init) => {
      timeouts.push(init?.timeoutMs);
      t += init?.timeoutMs ?? 30_000;
      return fail(null);
    });
    const sleep = vi.fn(async (ms: number) => {
      t += ms;
    });
    const start = t;
    await expect(searchOsmOrgs(["funeral_homes"], CENTER, 3, { fetcher, sleep, clock })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(OVERPASS_DEADLINE_MS).toBe(40_000);
    expect(t - start).toBeLessThanOrEqual(OVERPASS_DEADLINE_MS);
    // 30 s attempt, a 5 s wait, then the last 5 s for the second attempt; the 15 s wait never starts.
    expect(timeouts).toEqual([30_000, 5_000]);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5_000]);
    // The chain failed, so Overpass is left alone (no answer cools it too).
    expect(coolingUntil("overpass-api.de")).toBeGreaterThan(Date.now() + 60_000);
  });

  it("discoverOrgs measures the OpenStreetMap deadline from the search's start; demo:warm passes a longer one", async () => {
    const seen: (number | undefined)[] = [];
    const osm = vi.fn(async (_t: unknown, _c: unknown, _m: unknown, deps?: { deadlineAt?: number }) => {
      seen.push(deps?.deadlineAt);
      return { orgs: [], capped: [] };
    });
    const ctx = { office: CENTER, officeZip: "60614", state: "IL" };
    const req = { area: { kind: "zips" as const, zips: ["60614"] }, radiusMiles: 1, types: ["funeral_homes"] };
    const before = Date.now();
    await discoverOrgs(req, ctx, { osm });
    await discoverOrgs(req, ctx, { osm, osmDeadlineMs: WARM_OSM_DEADLINE_MS });
    const after = Date.now();
    expect(seen[0]).toBeGreaterThanOrEqual(before + OVERPASS_DEADLINE_MS);
    expect(seen[0]).toBeLessThanOrEqual(after + OVERPASS_DEADLINE_MS);
    expect(seen[1]).toBeGreaterThanOrEqual(before + WARM_OSM_DEADLINE_MS);
    expect(WARM_OSM_DEADLINE_MS).toBeGreaterThan(OVERPASS_DEADLINE_MS);
  });

  it("an attempt isn't started with too little time left", () => {
    expect(MIN_ATTEMPT_MS).toBeGreaterThan(0);
  });
});

describe("the cool-down", () => {
  it("a chain that ends in failure cools the host: no answer, 502 and 504 too", async () => {
    for (const status of [null, 502, 504, 429]) {
      clearSourceCache();
      await expect(withRetry(async () => fail(status), { delaysMs: [5], sleep: noSleep, host: HOST })).rejects.toBeInstanceOf(SourceUnavailable);
      expect(coolingUntil(HOST), String(status)).toBeGreaterThan(Date.now() + COOL_MS - 5_000);
    }
  });

  it("a chain that ends in an answer doesn't", async () => {
    let n = 0;
    await withRetry(async () => (n++ === 0 ? fail(429) : 1), { delaysMs: [5], sleep: noSleep, host: HOST });
    expect(coolingUntil(HOST)).toBe(0);
  });

  it("a host another search cooled isn't asked again: checked before and after each wait", async () => {
    // Before the wait: another search cooled it while this attempt ran.
    const sleep = vi.fn(async () => {});
    const first = vi.fn(async () => {
      cool(HOST);
      return fail(429);
    });
    await expect(withRetry(first, { delaysMs: [5, 15], sleep, host: HOST })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(first).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    // During the wait.
    clearSourceCache();
    const second = vi.fn(async () => fail(503));
    await expect(withRetry(second, { delaysMs: [5, 15], sleep: async () => cool(HOST), host: HOST })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("Overpass after one 429 is asked again after a short wait, the answer is used, and the host isn't cooled", async () => {
    const sleep = vi.fn((ms: number) => Promise.resolve(ms));
    let n = 0;
    const fetcher = vi.fn(async () => (n++ === 0 ? fail(429) : osmOrgs));
    const r = await searchOsmOrgs(["funeral_homes", "clergy"], CENTER, 3, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(OVERPASS_RETRY_MS[0]);
    expect(r.orgs.length).toBeGreaterThan(0);
    expect(coolingUntil("overpass-api.de")).toBe(0);
  });
});

describe("answers that couldn't be kept are reported", () => {
  it("OpenStreetMap: the failed insert reaches onStoreError, and the answer is still used", async () => {
    clearSourceCache();
    const onStoreError = vi.fn();
    const r = await searchOsmOrgs(["funeral_homes", "clergy"], CENTER, 3, { fetcher: async () => osmOrgs, sql: brokenSql(), onStoreError });
    expect(r.orgs.length).toBeGreaterThan(0);
    expect(onStoreError).toHaveBeenCalledTimes(1);
    expect(String(onStoreError.mock.calls[0][0])).toMatch(/the pooler is busy/);
    clearSourceCache();
  });

  it("CMS: the failed insert reaches onStoreError", async () => {
    clearSourceCache();
    const onStoreError = vi.fn();
    const r = await searchCmsAgencies(["hospice"], ["60614"], { fetcher: async () => hospice, sql: brokenSql(), onStoreError });
    expect(r.orgs.length).toBeGreaterThan(0);
    expect(onStoreError).toHaveBeenCalled();
    clearSourceCache();
  });

  it("discoverOrgs passes them on in plain words, naming the source", async () => {
    const seen: string[] = [];
    const cms = vi.fn(async (_t: unknown, _z: unknown, deps?: { onStoreError?: (e: unknown) => void }) => {
      deps?.onStoreError?.(new Error("insert failed"));
      return { orgs: [], unavailable: [] };
    });
    const osm = vi.fn(async (_t: unknown, _c: unknown, _m: unknown, deps?: { onStoreError?: (e: unknown) => void }) => {
      deps?.onStoreError?.(new Error("insert failed"));
      return { orgs: [], capped: [] };
    });
    await discoverOrgs(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["hospice", "funeral_homes"] },
      { office: CENTER, officeZip: "60614", state: "IL" },
      { cms, osm, onStoreError: (what) => seen.push(what) },
    );
    expect(seen).toEqual(["Couldn't keep a CMS Provider Data Catalog answer: insert failed", "Couldn't keep an OpenStreetMap answer: insert failed"]);
  });
});
