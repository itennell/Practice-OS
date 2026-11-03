// PR #134 review fixes: fail-closed do-not-contact reads, Overpass sensitive
// elements dropped before caching and back-off after 429/503, CMS paging before
// the nearest 100 are kept, sensitive people at a sensitive site, MCP writes
// queued, request size and rate limits. Recorded data only; no network.
import { describe, expect, it, vi } from "vitest";
import hospice from "./fixtures/referrals/sources/cms-hospice.json" with { type: "json" };
import osmOrgs from "./fixtures/referrals/sources/osm-orgs.json" with { type: "json" };
import { cachedJson, clearSourceCache, coolingUntil, postKey } from "../lib/referrals/sources/cache";
import { SourceUnavailable } from "../lib/referrals/sources/http";
import { OVERPASS_URL } from "../lib/referrals/sources/osm";
import { dropSensitive, orgQuery, searchOsmOrgs } from "../lib/referrals/sources/osm-orgs";
import { CMS_LIMIT, parsePdc, searchCmsAgencies } from "../lib/referrals/sources/cms-agencies";
import { discoverOrgs } from "../lib/referrals/orgs";
import { searchArea } from "../lib/referrals/area";
import { siteHashes } from "../lib/referrals/sensitive";
import type { Provider } from "../lib/referrals/nppes";

const AT = "2026-11-02T15:00:00.000Z";
const CENTER: [number, number] = [41.9214, -87.6513];

describe("Overpass: sensitive places never cached, polite after trouble", () => {
  it("drops shelters and DV/SA-named places before the answer is cached", async () => {
    clearSourceCache();
    const reply = { elements: [...osmOrgs.elements, { type: "node", id: 3001, lat: 41.92, lon: -87.65, tags: { amenity: "community_centre", name: "Harbor Domestic Violence Services" } }] };
    expect(JSON.stringify(dropSensitive(reply))).not.toMatch(/Safe House|Domestic Violence/);
    const fetcher = vi.fn(async () => reply);
    const types = ["libraries_community_centers", "senior_living"];
    await searchOsmOrgs(types, CENTER, 3, { fetcher });
    // What is cached for that question is the cleaned answer.
    const cached = await cachedJson(postKey(OVERPASS_URL, orgQuery(types, CENTER, 3 * 1609.34)), async () => {
      throw new Error("should come from the cache");
    });
    expect(JSON.stringify(cached)).not.toMatch(/Safe House|Domestic Violence|abused/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("after a 429 the host is left alone for a few minutes, and the failed question isn't asked again at once", async () => {
    clearSourceCache();
    const fetcher = vi.fn(async () => {
      throw new SourceUnavailable("OpenStreetMap (Overpass)", 429);
    });
    await expect(searchOsmOrgs(["funeral_homes"], CENTER, 3, { fetcher })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(coolingUntil("overpass-api.de")).toBeGreaterThan(Date.now() + 60_000);
    await expect(searchOsmOrgs(["clergy"], CENTER, 3, { fetcher })).rejects.toBeInstanceOf(SourceUnavailable);
    await expect(searchOsmOrgs(["funeral_homes"], CENTER, 3, { fetcher })).rejects.toBeInstanceOf(SourceUnavailable);
    expect(fetcher).toHaveBeenCalledTimes(1);
    clearSourceCache();
  });
});

describe("CMS: every page read, then the nearest 100 kept, and the cut said", () => {
  const row = (i: number, zip: string) => ({ ...hospice.results[0], cms_certification_number_ccn: String(150000 + i), facility_name: `[SAMPLE] HOSPICE ${i}`, zip_code: zip });
  it("reads page after page until a short one", async () => {
    clearSourceCache();
    const fetcher = vi.fn(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? 0);
      const n = offset < 200 ? 100 : 30;
      return { count: 230, results: Array.from({ length: n }, (_, i) => row(offset + i, "60614")) };
    });
    const r = await searchCmsAgencies(["hospice"], ["60614"], { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(r.orgs).toHaveLength(230);
    expect(r.more).toEqual([]);
  });
  it("sorts by distance before it keeps 100, and says so", async () => {
    const far = Array.from({ length: 120 }, (_, i) => parsePdc("hospice", { results: [row(i, "60657")] }, AT)[0]);
    const near = Array.from({ length: 30 }, (_, i) => parsePdc("hospice", { results: [row(500 + i, "60614")] }, AT)[0]);
    const r = await discoverOrgs(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 3, types: ["hospice"] },
      { office: [41.9224, -87.6533], officeZip: "60614", state: "IL" },
      { cms: async () => ({ orgs: [...far, ...near], unavailable: [] }), centers: { "60614": [41.9224, -87.6533], "60657": [41.9399, -87.6528] } },
    );
    expect(r.orgs).toHaveLength(CMS_LIMIT);
    expect(r.orgs.filter((o) => o.zip === "60614")).toHaveLength(30);
    expect(r.notes.join(" ")).toMatch(/There are 150 .* nearest 100/);
  });
});

describe("a person NPPES lists at a sensitive site is sensitive too", () => {
  const p = (over: Partial<Provider>): Provider =>
    ({
      npi: "1999999980", name: "[Sample] Lakeview Counseling", organization: null, practiceName: null, npiType: "individual", credential: "LCSW",
      taxonomy: "1041C0700X", taxonomyLabel: "Social Worker, Clinical", specialty: "therapists", specialtyLabel: "Therapists",
      address: "500 W Elm St", city: "Chicago", state: "IL", zip: "60614", phone: null, homeAddress: false, fax: null, ...over,
    }) as Provider;
  const deps = { geocode: async () => new Map(), centers: { "60614": [41.9224, -87.6533] as [number, number] } };
  it("by a sensitive group at the same address in the same results", async () => {
    const group = p({ npi: "1999999981", npiType: "organization", name: "[Sample] Harbor Women's Shelter", organization: "[Sample] Harbor Women's Shelter" });
    const person = p({ npi: "1999999982", name: "[Sample] Jordan Example" });
    const elsewhere = p({ npi: "1999999983", name: "[Sample] Other Example", address: "900 W Belmont Ave" });
    const r = await searchArea(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, specialties: ["therapists"] },
      { office: [41.92, -87.65], officeZip: "60614", state: "IL", focus: [] },
      { ...deps, search: async () => ({ providers: [group, person, elsewhere], requests: 1, truncated: false, timedOut: null }) },
    );
    const by = new Map(r.providers.map((x) => [x.npi, x]));
    expect(by.get("1999999982")).toMatchObject({ sensitive: true, address: "", zip: "", lat: null, distanceMiles: null });
    expect(by.get("1999999983")?.sensitive).toBeFalsy();
  });
  it("by a known sensitive site on her board (its one-way hash)", async () => {
    const person = p({ npi: "1999999984", name: "[Sample] Casey Example", address: "500 WEST ELM STREET" });
    const r = await searchArea(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, specialties: ["therapists"] },
      { office: [41.92, -87.65], officeZip: "60614", state: "IL", focus: [], sensitiveSites: new Set(siteHashes("500 W Elm St", "60614")) },
      { ...deps, search: async () => ({ providers: [person], requests: 1, truncated: false, timedOut: null }) },
    );
    expect(r.providers[0]).toMatchObject({ sensitive: true, lat: null });
  });
});

describe("fail closed, MCP, request limits", () => {
  it("her do-not-contact list fails closed when it can't be read", async () => {
    const { suppressedList } = await import("../lib/referrals/contacts");
    const down = (() => Promise.reject(new Error("database down"))) as never;
    await expect(suppressedList(down)).rejects.toThrow(/down/);
  });
  it("every Referrals write waits for her approval when another app asks over MCP", async () => {
    const { TOOLS } = await import("../lib/aeon/tools");
    for (const n of ["add_referral_source", "find_referral_sources", "move_referral_source", "log_referral_contact"]) {
      expect(TOOLS.find((t) => t.name === n)?.queuesOverMcp, n).toBe(true);
    }
  });
  it("manual add and import read the size before the body", async () => {
    const { POST: manual } = await import("../app/api/referrals/manual/route");
    const { POST: imp } = await import("../app/api/referrals/import/route");
    const req = (url: string, body: string, length: number) =>
      new Request(`http://localhost:3000${url}`, {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": String(length), host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
        body,
      });
    expect((await manual(req("/api/referrals/manual", "{}", 50_000))).status).toBe(413);
    expect((await imp(req("/api/referrals/import", "{}", 5_000_000))).status).toBe(413);
  });
});
