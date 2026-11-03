// demo:warm follow-ups (2026-11-03): Overpass is asked again after a short wait when it
// is rate limited or busy, and a CMS or OpenStreetMap answer that couldn't be kept in
// referral_fetch_cache is reported (demo:warm's notKept) instead of swallowed.
// Recorded data only; no network, no database.
import type postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import hospice from "./fixtures/referrals/sources/cms-hospice.json" with { type: "json" };
import osmOrgs from "./fixtures/referrals/sources/osm-orgs.json" with { type: "json" };
import { clearSourceCache, coolingUntil, RETRY_AFTER_MAX_MS, withRetry } from "../lib/referrals/sources/cache";
import { retryAfterMs, SourceUnavailable } from "../lib/referrals/sources/http";
import { OVERPASS_RETRY_MS, searchOsmOrgs } from "../lib/referrals/sources/osm-orgs";
import { searchCmsAgencies } from "../lib/referrals/sources/cms-agencies";
import { discoverOrgs } from "../lib/referrals/orgs";

const CENTER: [number, number] = [41.9214, -87.6513];
const noSleep = vi.fn(async () => {});

/** A database whose reads come back empty and whose writes fail. */
function brokenSql(): postgres.Sql {
  const sql = (strings: TemplateStringsArray) =>
    strings.join("?").trim().startsWith("select") ? Promise.resolve([]) : Promise.reject(new Error("the pooler is busy"));
  return sql as unknown as postgres.Sql;
}

describe("withRetry", () => {
  it("asks again after each wait when the source is rate limited or busy, then gives up", async () => {
    const sleep = vi.fn((ms: number) => Promise.resolve(ms));
    const ask = vi.fn(async () => {
      throw new SourceUnavailable("Overpass", 429);
    });
    await expect(withRetry(ask, [5, 15], sleep)).rejects.toBeInstanceOf(SourceUnavailable);
    expect(ask).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5, 15]);
  });

  it("stops as soon as one answers", async () => {
    let n = 0;
    const ask = vi.fn(async () => {
      if (n++ === 0) throw new SourceUnavailable("Overpass", 504);
      return { ok: true };
    });
    await expect(withRetry(ask, [5, 15], noSleep)).resolves.toEqual({ ok: true });
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("waits out a Retry-After the source sent, but not a long one", async () => {
    const sleep = vi.fn((ms: number) => Promise.resolve(ms));
    let n = 0;
    await withRetry(
      async () => {
        if (n++ === 0) throw new SourceUnavailable("Overpass", 429, 8_000);
        return 1;
      },
      [5],
      sleep,
    );
    expect(sleep).toHaveBeenCalledWith(8_000);
    const long = vi.fn(async () => {
      throw new SourceUnavailable("Overpass", 429, RETRY_AFTER_MAX_MS + 1);
    });
    await expect(withRetry(long, [5], sleep)).rejects.toBeInstanceOf(SourceUnavailable);
    expect(long).toHaveBeenCalledTimes(1);
  });

  it("doesn't retry a refusal (403) or a bug", async () => {
    const forbidden = vi.fn(async () => {
      throw new SourceUnavailable("Overpass", 403);
    });
    await expect(withRetry(forbidden, [5], noSleep)).rejects.toBeInstanceOf(SourceUnavailable);
    expect(forbidden).toHaveBeenCalledTimes(1);
    const bug = vi.fn(async () => {
      throw new TypeError("oops");
    });
    await expect(withRetry(bug, [5], noSleep)).rejects.toBeInstanceOf(TypeError);
    expect(bug).toHaveBeenCalledTimes(1);
  });

  it("reads Retry-After in seconds only", () => {
    expect(retryAfterMs("12")).toBe(12_000);
    expect(retryAfterMs(" 3 ")).toBe(3_000);
    expect(retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT")).toBeNull();
    expect(retryAfterMs(null)).toBeNull();
  });
});

describe("Overpass after a 429", () => {
  it("is asked again after a short wait and the answer is used; the host isn't cooled", async () => {
    clearSourceCache();
    const sleep = vi.fn((ms: number) => Promise.resolve(ms));
    let n = 0;
    const fetcher = vi.fn(async () => {
      if (n++ === 0) throw new SourceUnavailable("OpenStreetMap (Overpass)", 429);
      return osmOrgs;
    });
    const r = await searchOsmOrgs(["funeral_homes", "clergy"], CENTER, 3, { fetcher, sleep });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(OVERPASS_RETRY_MS[0]);
    expect(r.orgs.length).toBeGreaterThan(0);
    expect(coolingUntil("overpass-api.de")).toBe(0);
    clearSourceCache();
  });

  it("waits a few seconds, then longer, before giving up", () => {
    expect(OVERPASS_RETRY_MS).toEqual([5_000, 15_000]);
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
