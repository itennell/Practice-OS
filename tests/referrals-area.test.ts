import { beforeEach, describe, expect, it } from "vitest";
import fixture from "./fixtures/nppes-area.json";
import { chicagolandZips, linkGroups, LOOP, parseArea, searchArea, zipsNear, type PracticeContext } from "../lib/referrals/area";
import { addressKey, clearGeocodeCache, geocodeAddresses, parseCensusLine } from "../lib/referrals/geocode";
import { haversineMiles, zipCenters } from "../lib/referrals/geo";
import {
  cachedFetch,
  clearNppesCache,
  parseResponses,
  parseResult,
  searchProviders,
  specialtyForCode,
  titleCase,
  type NppesResponse,
  type NppesResult,
} from "../lib/referrals/nppes";
import { boardTier, capFirst, focusFrom, SPECIALTY_POINTS, TIER_LABEL, tierFor } from "../lib/referrals/tier";

// Real NPPES replies recorded 2026-10-29 (tests/fixtures/nppes-area.json, fields the app reads only).
type Recorded = { query: { taxonomy_description: string; postal_code: string }; results: NppesResult[] };
const recorded = fixture.responses as unknown as Recorded[];

/** Answers a NPPES URL from the recording; anything not recorded is an empty page. */
async function fromRecording(url: string): Promise<NppesResponse> {
  const q = new URL(url).searchParams;
  const hit = recorded.find((r) => r.query.taxonomy_description === q.get("taxonomy_description") && r.query.postal_code === q.get("postal_code"));
  return { results: Number(q.get("skip")) === 0 ? (hit?.results ?? []) : [] };
}

beforeEach(() => {
  clearNppesCache();
  clearGeocodeCache();
});

describe("reading the area box", () => {
  it.each([
    ["60614", { kind: "zips", zips: ["60614"] }],
    ["60614, 60657 60614", { kind: "zips", zips: ["60614", "60657"] }],
    ["All of Chicagoland", { kind: "chicagoland" }],
    ["chicagoland", { kind: "chicagoland" }],
    ["Lincoln Park", { kind: "place", place: "Lincoln Park" }],
    ["Evanston 60201", { kind: "place", place: "Evanston 60201" }],
    ["  ", { kind: "empty" }],
  ])("%s", (text, want) => {
    expect(parseArea(text)).toEqual(want);
  });
});

describe("Chicagoland and radius ZIPs (Census 2020 ZCTA centers)", () => {
  it("is every Illinois ZCTA within 30 miles of the Loop", async () => {
    const centers = await zipCenters();
    const zips = chicagolandZips(centers);
    expect(zips.length).toBeGreaterThan(150);
    expect(zips).toEqual(expect.arrayContaining(["60614", "60601", "60201", "60302", "60515"]));
    expect(zips).not.toContain("61820"); // Champaign
    expect(zips).not.toContain("46320"); // Hammond, Indiana
    for (const z of zips) expect(haversineMiles(LOOP, centers[z])).toBeLessThanOrEqual(30);
  });

  it("grows with the radius, nearest first, and says when it caps", async () => {
    const centers = await zipCenters();
    const one = zipsNear(centers, [centers["60614"]], 1, 12);
    const five = zipsNear(centers, [centers["60614"]], 5, 12);
    expect(one.zips[0]).toBe("60614");
    expect(five.zips.length).toBeGreaterThan(one.zips.length);
    expect(five.capped).toBe(true);
  });
});

describe("NPPES on real recorded replies", () => {
  it("counts pediatric NPs and subspecialists as pediatrics, and OB-GYN subspecialties as OB-GYN", () => {
    expect(specialtyForCode("363LP0200X")?.id).toBe("pediatrics");
    expect(specialtyForCode("2080P0204X")?.id).toBe("pediatrics");
    expect(specialtyForCode("207VM0101X")?.id).toBe("ob_gyn");
    expect(specialtyForCode("207VX0201X")?.id).toBe("oncology"); // exact code beats the 207V* prefix
    expect(specialtyForCode("2084P0804X")?.id).toBe("psychiatry");
    const peds = recorded.find((r) => r.query.taxonomy_description === "Pediatrics" && r.query.postal_code === "60614")!;
    expect(parseResponses([peds]).length).toBeGreaterThan(30);
  });

  it("uses a group's Doing Business As name as its practice name", () => {
    const counselors = recorded.find((r) => r.query.taxonomy_description === "Counselor")!.results;
    const group = counselors.find((r) => r.other_names?.some((o) => o.code === "3"))!;
    const p = parseResult(group)!;
    expect(p.npiType).toBe("organization");
    expect(p.practiceName).toBe("Amk Counseling");
    expect(p.organization).toBe("Abbie Kelley, LLC");
    expect(titleCase("NORTH SHORE PEDIATRICS, S.C.")).toBe("North Shore Pediatrics, S.C.");
  });

  it("asks each URL once while it is cached, and stops at the request budget", async () => {
    const asked: string[] = [];
    const fetcher = cachedFetch(async (url) => (asked.push(url), fromRecording(url)));
    await searchProviders(["pediatrics"], ["60614"], { fetcher });
    await searchProviders(["pediatrics"], ["60614"], { fetcher });
    expect(asked).toHaveLength(1);
    const full = { results: Array.from({ length: 200 }, (_, i) => ({ ...recorded[0].results[0], number: String(1000000000 + i) })) };
    const capped = await searchProviders(["therapists"], ["60614", "60657"], { fetcher: async () => full, maxRequests: 5 });
    expect(capped.requests).toBe(5);
    expect(capped.truncated).toBe(true);
  });

  it("links a person to a group at the same address", () => {
    const base = parseResult(recorded[0].results[0])!;
    const group = { ...base, npi: "1111111111", npiType: "organization" as const, practiceName: "Lincoln Park Kids" };
    expect(linkGroups([base, group]).get(base.npi)).toBe("Lincoln Park Kids");
  });
});

describe("Census geocoder reply", () => {
  it("reads a match as [lat, lon] and a miss as null, and caches by address", async () => {
    expect(parseCensusLine(`"1","2551 N Clark St, Chicago, IL, 60614","Match","Exact","2551 N CLARK ST, CHICAGO, IL, 60614","-87.6425,41.9291","111767067","R"`)).toEqual({
      id: "1",
      point: [41.9291, -87.6425],
    });
    expect(parseCensusLine(`"2","1 Bad Rd, Nowhere, IL, 60614","No_Match"`)).toEqual({ id: "2", point: null });
    let posts = 0;
    const post = async () => (posts++, `"0","x","Match","Exact","x","-87.64,41.92","1","R"\n`);
    const a = { street: "2551 N Clark St", city: "Chicago", state: "IL", zip: "60614" };
    expect((await geocodeAddresses([a, a], { post })).get(addressKey(a))).toEqual([41.92, -87.64]);
    await geocodeAddresses([a], { post });
    expect(posts).toBe(1);
  });
});

describe("tiers (plain code, with reasons)", () => {
  it("reads who she helps from her own words", () => {
    expect(focusFrom("[Sample] Adults in Chicago going through work stress and life transitions")).toEqual(["adults"]);
    expect(focusFrom("Teens and their parents; some postpartum moms")).toEqual(["teens", "families", "perinatal"]);
    expect(focusFrom("Older adults")).toEqual(["older_adults"]);
    expect(focusFrom("")).toEqual([]);
  });

  const today = new Date("2026-10-29");
  const ped = {
    taxonomy: "208000000X",
    npiType: "individual" as const,
    phone: "773-555-0100",
    fax: "773-555-0101",
    lastUpdated: "2025-06-01",
    state: "IL",
  };
  const ctx = { miles: 0.8, focus: ["teens" as const], clinicianState: "IL", today };

  it("takes its points and tier lines from docs/research/referral-tiers.json", () => {
    expect(TIER_LABEL).toEqual({ first: "Reach out first", next: "Warm up next", later: "Later" });
    expect(SPECIALTY_POINTS).toMatchObject({ family_medicine: 35, pediatrics: 33, psychiatry: 30 });
  });

  it("puts a nearby pediatrician first for a teens practice, with the reasons", () => {
    const r = tierFor(ped, ctx);
    // specialty 33 + distance 25-5*0.8=21 + named person 15 + phone 6 + fax 4 + fresh 10 + Illinois 5
    expect(r).toEqual({
      tier: "first",
      score: 94,
      specialty: "pediatrics",
      reasons: [
        "Pediatrics offices see people who need talk therapy and often have no one to send them to",
        "matches your teens focus",
        "0.8 mi from your office",
        "you can write to them by name, not a front desk",
        "office phone and fax on file",
      ],
    });
  });

  it("puts a pediatrician Later for an adults-only practice, and says why", () => {
    const r = tierFor(ped, { ...ctx, focus: ["adults"] });
    expect(r.tier).toBe("later");
    expect(r.reasons).toContain("mostly sees children and teens and families, not who you help");
  });

  it("weighs distance, a named contact at a group, contact details, record age and state", () => {
    const near = tierFor(ped, { ...ctx, miles: 1 });
    const far = tierFor(ped, { ...ctx, miles: 6 });
    expect(near.score - far.score).toBe(20);
    const group = tierFor({ ...ped, npiType: "organization", official: "Ann Lee" }, ctx);
    expect(group.score).toBe(94 - 15 + 8);
    expect(group.reasons).toContain("a group; you can write to Ann Lee by name");
    const desk = tierFor({ ...ped, npiType: "organization" }, ctx);
    expect(desk.score).toBe(94 - 15 + 3);
    const old = tierFor({ ...ped, lastUpdated: "2012-03-01", phone: null, fax: null, state: "WI" }, ctx);
    expect(old.score).toBe(94 - 10 - 10 - 5);
    expect(old.reasons).toContain("record last updated 2012; confirm they still practice before writing");
    const unknown = tierFor({ taxonomy: null, npiType: null }, { miles: null, focus: [] });
    expect(unknown).toMatchObject({ tier: "later", specialty: null, score: 18 + 8 + 3 });
    expect(unknown.reasons).toContain("distance unknown");
  });
});

describe("board cards", () => {
  const card = { taxonomy: "207Q00000X", npi_type: "organization" as const, phone: null, state: "IL", fit_score: 81, distance_miles: 0.6 };
  it("take the tier from the score saved when found, and still say why", () => {
    const r = boardTier(card, { focus: ["adults"], clinicianState: "IL" });
    expect(r).toMatchObject({ tier: "first", score: 81 });
    expect(r.reasons).toContain("0.6 mi from your office");
    expect(boardTier({ ...card, fit_score: 55 }, { focus: [] }).tier).toBe("next");
  });
  it("keep a pediatrics card Later for an adults practice", () => {
    expect(boardTier({ ...card, taxonomy: "208000000X", fit_score: 95 }, { focus: ["adults"] }).tier).toBe("later");
  });
});

describe("Reach out first stays a short list", () => {
  it("keeps the top 12 and moves the rest down with a reason", () => {
    const strong = tierFor({ taxonomy: "207Q00000X", npiType: "individual" }, { miles: 0.2, focus: ["adults"] });
    const capped = capFirst(Array.from({ length: 15 }, (_, i) => ({ npi: String(i), tier: { ...strong, tier: "first" as const } })));
    expect(capped.filter((p) => p.tier.tier === "first")).toHaveLength(12);
    expect(capped[12].tier).toMatchObject({ tier: "next" });
    expect(capped[12].tier.reasons.at(-1)).toBe("a strong fit, after your top 12 in this search");
  });
});

describe("area search, golden run on the recorded 60614 replies", () => {
  const ctx: PracticeContext = { office: null, officeZip: "60614", state: "IL", focus: ["adults"] };

  it("places, links, tiers and sorts every provider, saving nothing", async () => {
    const result = await searchArea(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, specialties: ["pediatrics", "psychiatry", "therapists", "ob_gyn"] },
      ctx,
      {
        search: (s, z, o) => searchProviders(s, z, { ...o, fetcher: fromRecording }),
        geocode: async () => new Map(),
      },
    );
    expect(result.label).toBe("60614");
    expect(result.zips[0]).toBe("60614");
    const ps = result.providers;
    expect(ps.length).toBeGreaterThan(60);
    expect(new Set(ps.map((p) => p.npi)).size).toBe(ps.length);
    for (const p of ps) {
      expect(p.precision).toBe("zip"); // no geocoder answers here, so every pin is at its ZIP's center
      expect(p.tier.reasons.length).toBeGreaterThanOrEqual(2);
      expect(result.zips).toContain(p.zip);
    }
    // Tiers come first to last, best score first inside each.
    const order = ps.map((p) => ["first", "next", "later"].indexOf(p.tier.tier));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    // For an adults practice: psychiatry leads, pediatrics is Later.
    expect(ps[0].tier.specialty).toBe("psychiatry");
    expect(ps.filter((p) => p.tier.specialty === "pediatrics").every((p) => p.tier.tier === "later")).toBe(true);
    const counts = Object.fromEntries(["first", "next", "later"].map((t) => [t, ps.filter((p) => p.tier.tier === t).length]));
    expect(counts.first).toBeGreaterThan(0);
    expect(counts.next).toBeGreaterThan(0);
    expect(counts.later).toBeGreaterThan(0);
  });

  it("refuses an unknown ZIP or an empty kind list in plain words", async () => {
    await expect(searchArea({ area: { kind: "zips", zips: ["00000"] }, radiusMiles: 1, specialties: ["pediatrics"] }, ctx)).rejects.toThrow(
      "I don't know ZIP 00000",
    );
    await expect(searchArea({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, specialties: [] }, ctx)).rejects.toThrow("Pick at least one");
  });

  it("searches Chicagoland by ZIP prefix and keeps only Chicagoland ZIPs", async () => {
    const asked: string[] = [];
    const result = await searchArea({ area: { kind: "chicagoland" }, radiusMiles: 3, specialties: ["pediatrics"] }, ctx, {
      search: (s, z, o) => searchProviders(s, z, { ...o, fetcher: async (url) => (asked.push(new URL(url).searchParams.get("postal_code")!), fromRecording(url)) }),
      geocode: async () => new Map(),
    });
    expect(asked).toContain("606*");
    expect(asked.every((p) => /^60\d\*$/.test(p))).toBe(true);
    expect(result.providers.length).toBeGreaterThan(10);
    const inArea = new Set(result.zips);
    for (const p of result.providers) expect(inArea.has(p.zip)).toBe(true);
  });
});
