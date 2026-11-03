// Referrals discovery: hospices and home health agencies from the CMS Provider
// Data Catalog, organisations from OpenStreetMap (Overpass), cards she adds by
// hand or from a CSV, sensitive types without a street, and do-not-contact for
// cards with no NPI. Recorded replies only (made-up [Sample] places, 555
// phones); nothing here reaches the network.
import { describe, expect, it, vi } from "vitest";
import hospice from "./fixtures/referrals/sources/cms-hospice.json" with { type: "json" };
import homeHealth from "./fixtures/referrals/sources/cms-home-health.json" with { type: "json" };
import osmOrgs from "./fixtures/referrals/sources/osm-orgs.json" with { type: "json" };
import { CMS_DATASETS, parsePdc, pdcFacts, pdcUrl, searchCmsAgencies } from "../lib/referrals/sources/cms-agencies";
import { byIdQuery, OSM_CAP_WORSHIP, orgQuery, osmOrgFacts, osmTypes, parseOsmOrgs, searchOsmOrgs } from "../lib/referrals/sources/osm-orgs";
import { cachedJson, clearSourceCache, postKey } from "../lib/referrals/sources/cache";
import { mergeEvidence, OSM_ATTRIBUTION } from "../lib/referrals/evidence/merge";
import { discoverOrgs, discoveryTypes, DISCOVERY_IDS } from "../lib/referrals/orgs";
import { CSV_TEMPLATE, parseCsv, readCsv, readManual } from "../lib/referrals/manual";
import { findDuplicate } from "../lib/referrals/dedupe";
import { isSuppressed, keyMatches, nameSuppressed, orgKeyOf, type Suppressed } from "../lib/referrals/dnc-key";
import { manualToCard, orgToCard, stripSensitive } from "../lib/referrals/org-store";
import { REFERRAL_DEMO_TOOLS } from "../lib/features";
import { haversineMiles } from "../lib/referrals/geo";
import { CONTACT_KINDS, LOGGABLE_KINDS } from "../lib/referrals/contact-kinds";
import { isSensitiveSource, siteHashes, withoutDistance } from "../lib/referrals/sensitive";
import { searchArea } from "../lib/referrals/area";
import type { Provider } from "../lib/referrals/nppes";

const AT = "2026-11-02T15:00:00.000Z";
const LINCOLN_PARK: [number, number] = [41.9214, -87.6513];

describe("CMS Provider Data Catalog (hospice yc9t-dgbk, home health 6jpm-sxkc)", () => {
  it("names the right public datasets", () => {
    expect(CMS_DATASETS.hospice.id).toBe("yc9t-dgbk");
    expect(CMS_DATASETS.home_health.id).toBe("6jpm-sxkc");
    expect(CMS_DATASETS.hospice.page).toBe("https://data.cms.gov/provider-data/dataset/yc9t-dgbk");
  });
  it("asks the datastore by ZIP, one request per dataset", () => {
    const url = new URL(pdcUrl("hospice", { zips: ["60657", "60614"] }));
    expect(url.pathname).toBe("/provider-data/api/1/datastore/query/yc9t-dgbk/0");
    expect(url.searchParams.get("conditions[0][property]")).toBe("zip_code");
    expect(url.searchParams.get("conditions[0][operator]")).toBe("in");
    expect(url.searchParams.getAll("conditions[0][value][]")).toEqual(["60614", "60657"]);
    expect(new URL(pdcUrl("home_health", { ccns: ["147001"] })).searchParams.get("conditions[0][property]")).toBe("cms_certification_number_ccn");
  });
  it("reads hospice rows: CCN, name, street, phone; skips rows without a CCN", () => {
    const rows = parsePdc("hospice", hospice, AT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "cms:141599",
      type: "hospice",
      ccn: "141599",
      name: "[Sample] Lakeview Hospice And Palliative Care, LLC",
      street: "2500 North Clark Street, Suite 300",
      city: "Chicago",
      zip: "60614",
      phone: "312-555-0161",
      origin: "cms_pdc",
      originUrl: "https://data.cms.gov/provider-data/dataset/yc9t-dgbk",
    });
    // "-" means empty in these files.
    expect(rows[1].street).toBe("900 West Belmont Avenue");
  });
  it("reads home health rows (their own column names)", () => {
    const [row] = parsePdc("home_health", homeHealth, AT);
    expect(row).toMatchObject({ key: "cms:147001", type: "home_health", name: "[Sample] Lincoln Park Home Health", phone: "312-555-0183", zip: "60614" });
  });
  it("its facts confirm the card as 'CMS Provider Data Catalog (date)'", () => {
    const [row] = parsePdc("hospice", hospice, AT);
    const facts = pdcFacts(row);
    expect(facts.map((f) => f.field)).toEqual(["name", "address", "phone"]);
    expect(facts[0].detail).toMatchObject({ ccn: "141599", dataset: "yc9t-dgbk" });
    const ev = mergeEvidence(facts, { isOrg: true, now: new Date(AT) });
    expect(ev.confirmedBy).toContain("CMS Provider Data Catalog (Nov 2, 2026)");
    expect(ev.fields.phone?.value).toBe("312-555-0161");
  });
  it("a dataset that doesn't answer is named, the other still counts", async () => {
    clearSourceCache();
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes("yc9t-dgbk")) throw new Error("503");
      return homeHealth;
    });
    const r = await searchCmsAgencies(["hospice", "home_health"], ["60614"], { fetcher });
    expect(r.unavailable).toEqual(["CMS Hospice - General Information"]);
    expect(r.orgs.map((o) => o.ccn)).toEqual(["147001"]);
  });
});

describe("OpenStreetMap organisations (Overpass)", () => {
  it("one query for every picked type, named places only, with a timeout", () => {
    const q = orgQuery(["funeral_homes", "clergy", "libraries_community_centers"], LINCOLN_PARK, 4828);
    expect(q.startsWith("[out:json][timeout:25];")).toBe(true);
    expect(q).toContain('nwr["shop"~"^(funeral_directors)$"]["name"](around:4828,41.92140,-87.65130);');
    expect(q).toContain('nwr["amenity"~"^(place_of_worship)$"]["name"]');
    expect(q).toContain('nwr["amenity"~"^(community_centre|library)$"]["name"]');
    expect(q).toMatch(/out tags center \d+;$/);
    expect(byIdQuery(["node/1", "way/2", "bad"])).toContain("node(id:1);way(id:2);");
  });
  it("never asks for a sensitive type; the social facilities it asks for are senior living", () => {
    expect(osmTypes()).toEqual(expect.arrayContaining(["clergy", "funeral_homes", "libraries_community_centers", "senior_living"]));
    expect(osmTypes()).not.toContain("shelters");
    expect(osmTypes()).not.toContain("dv_sa_agencies");
    expect(orgQuery(["shelters", "dv_sa_agencies"], LINCOLN_PARK, 1000)).not.toMatch(/shelter/);
  });
  it("ranks by distance, caps places of worship, drops shelters and nameless places", () => {
    const { orgs, capped } = parseOsmOrgs(osmOrgs, ["clergy", "funeral_homes", "libraries_community_centers", "senior_living"], [41.92, -87.65], AT);
    const churches = orgs.filter((o) => o.type === "clergy");
    expect(churches).toHaveLength(OSM_CAP_WORSHIP);
    expect(capped).toEqual(["clergy"]);
    expect(churches[0].name).toBe("[Sample] Church 00");
    expect(orgs.some((o) => /Safe House/.test(o.name))).toBe(false);
    const funeral = orgs.find((o) => o.type === "funeral_homes")!;
    expect(funeral).toMatchObject({ key: "osm:way/2001", street: "2401 North Lincoln Avenue", zip: "60614", phone: "312-555-0190", website: "https://fullerton-funeral.example", precision: "address" });
    // An unsafe website is never kept.
    expect(orgs.find((o) => o.type === "senior_living")?.website).toBeNull();
    const miles = orgs.map((o) => haversineMiles([41.92, -87.65], [o.lat!, o.lon!]));
    expect([...miles].sort((a, b) => a - b)).toEqual(miles);
  });
  it("places of worship only when picked: the parse ignores types not asked for", () => {
    const { orgs } = parseOsmOrgs(osmOrgs, ["funeral_homes"], [41.92, -87.65], AT);
    expect(orgs.every((o) => o.type === "funeral_homes")).toBe(true);
  });
  it("every OpenStreetMap fact carries the ODbL attribution, and the card says it", () => {
    const { orgs } = parseOsmOrgs(osmOrgs, ["funeral_homes"], [41.92, -87.65], AT);
    const facts = osmOrgFacts(orgs[0]);
    expect(facts.every((f) => f.detail?.attribution === OSM_ATTRIBUTION)).toBe(true);
    expect(OSM_ATTRIBUTION).toBe("© OpenStreetMap contributors (ODbL)");
    const ev = mergeEvidence(facts, { isOrg: true, now: new Date(AT) });
    // The card names the source; the evidence box shows the attribution line beside it (components/referrals/evidence-box.tsx).
    expect(ev.confirmedBy).toContain("OpenStreetMap");
    expect(ev.fields.name?.origins).toContain("osm");
  });
  it("asks Overpass once per search, by POST, and the second search is cached", async () => {
    clearSourceCache();
    const fetcher = vi.fn(async () => osmOrgs);
    await searchOsmOrgs(["funeral_homes", "clergy"], LINCOLN_PARK, 3, { fetcher });
    await searchOsmOrgs(["funeral_homes", "clergy"], LINCOLN_PARK, 3, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect(decodeURIComponent(init.body)).toContain("[timeout:25]");
  });
  it("the cache key for a POST stays short and stable", async () => {
    expect(postKey("https://overpass-api.de/api/interpreter", "x".repeat(5000)).length).toBeLessThan(200);
    clearSourceCache();
    let n = 0;
    const load = async () => ({ n: ++n });
    expect(await cachedJson("https://example.test/a", load)).toEqual({ n: 1 });
    expect(await cachedJson("https://example.test/a", load)).toEqual({ n: 1 });
    expect(await cachedJson("https://example.test/a", load, { ttlMs: 0 })).toEqual({ n: 2 });
  });
});

describe("what to look for", () => {
  it("her picks win; places of worship only when she picked them or her niche lists them", () => {
    expect(discoveryTypes(["funeral_homes", "clergy", "nope"], null)).toEqual(["funeral_homes", "clergy"]);
    expect(discoveryTypes(null, null)).not.toContain("clergy");
    expect(discoveryTypes(null, "oncology_serious_illness")).toEqual(expect.arrayContaining(["hospice", "home_health", "funeral_homes", "clergy"]));
    expect(discoveryTypes(null, "perinatal_reproductive")).not.toContain("clergy");
    expect(DISCOVERY_IDS).toContain("hospice");
  });
});

describe("discoverOrgs", () => {
  const centers = { "60614": [41.9224, -87.6533] as [number, number], "60657": [41.9399, -87.6528] as [number, number] };
  const ctx = (suppressed?: Suppressed) => ({ office: null, officeZip: "60614", state: "IL", suppressed });
  const cms = vi.fn(async () => ({ orgs: [...parsePdc("hospice", hospice, AT), ...parsePdc("home_health", homeHealth, AT)], unavailable: [] }));
  const osm = vi.fn(async (types: string[], center: [number, number], _miles: number) => (void _miles, parseOsmOrgs(osmOrgs, types, center, AT)));

  it("merges both sources nearest first, keeps CMS when both list the same place, and attributes both", async () => {
    const r = await discoverOrgs({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["hospice", "home_health", "funeral_homes", "clergy"] }, ctx(), { cms, osm, centers });
    expect(osm).toHaveBeenCalledTimes(1);
    const lakeview = r.orgs.filter((o) => /Lakeview Hospice/.test(o.name));
    expect(lakeview).toHaveLength(1);
    expect(lakeview[0].origin).toBe("cms_pdc");
    expect(r.attribution.join(" ")).toContain("yc9t-dgbk");
    expect(r.attribution.join(" ")).toContain(OSM_ATTRIBUTION);
    const d = r.orgs.map((o) => o.distanceMiles ?? 99);
    expect([...d].sort((a, b) => a - b)).toEqual(d);
  });
  it("leaves out everyone on her do-not-contact list, by org key", async () => {
    const key = orgKeyOf({ name: "[Sample] Fullerton Funeral Home", npi_type: "organization", address: "2401 N Lincoln Ave", zip: "60614", city: "Chicago" })!;
    const r = await discoverOrgs({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["funeral_homes"] }, ctx({ npis: new Set(), orgs: [key] }), { cms, osm, centers });
    expect(r.orgs.some((o) => /Fullerton/.test(o.name))).toBe(false);
  });
  it("says what is already on her board", async () => {
    const cards = [{ id: "c1", name: "[Sample] Lincoln Park Home Health", npi: null, ccn: "147001", osm_ref: null, organization: null, npi_type: "organization" as const, address: null, city: "Chicago", zip: "60614", phone: null, stage: "found" as const }];
    const r = await discoverOrgs({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["home_health"] }, ctx(), { cms, osm, centers, cards });
    expect(r.orgs.find((o) => o.ccn === "147001")?.onBoard).toEqual({ id: "c1", stage: "found" });
  });
  it("OpenStreetMap is asked within 5 miles at most, and Chicagoland is refused", async () => {
    osm.mockClear();
    const r = await discoverOrgs({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 10, types: ["clergy"] }, ctx(), { cms, osm, centers });
    expect(osm.mock.calls[0][2]).toBe(5);
    expect(r.notes.join(" ")).toContain("within 5 miles");
    await expect(discoverOrgs({ area: { kind: "chicagoland" }, radiusMiles: 3, types: ["clergy"] }, ctx(), { cms, osm, centers })).rejects.toThrow(/too wide/);
  });
});

describe("adding by hand and from a CSV", () => {
  it("reads the form in plain code", () => {
    const r = readManual({ name: "Gilda's Club Chicago", type: "disease_orgs", phone: "(312) 555-0100", city: "Chicago", state: "il" });
    expect(r).toEqual({ ok: true, input: expect.objectContaining({ kind: "organization", type: "disease_orgs", phone: "312-555-0100", state: "IL" }) });
    expect(readManual({ name: "X Org", type: "nope", city: "Chicago" })).toMatchObject({ ok: false });
    expect(readManual({ name: "X Org", type: "Funeral homes", city: "Chicago" })).toMatchObject({ ok: true, input: { type: "funeral_homes" } });
    expect(readManual({ name: "X Org", type: "funeral_homes", phone: "12" , city: "Chicago"})).toMatchObject({ ok: false, error: expect.stringMatching(/phone/) });
    expect(readManual({ name: "X Org", type: "funeral_homes" })).toMatchObject({ ok: false, error: expect.stringMatching(/city or a ZIP/) });
    expect(readManual({ name: "Jordan Ellis", organization: "Northside Hospital", type: "nurse_navigators", city: "Chicago" })).toMatchObject({ ok: true, input: { kind: "person" } });
  });
  it("a sensitive type keeps only its city: the street and ZIP are dropped when read and again when saved", () => {
    const r = readManual({ name: "[Sample] Safe Harbor", type: "dv_sa_agencies", street: "100 Hidden St", zip: "60614", city: "Chicago" });
    expect(r.ok && r.input.street).toBeNull();
    expect(r.ok && r.input.zip).toBeNull();
    expect(readManual({ name: "[Sample] Safe Harbor", type: "shelters", street: "100 Hidden St" })).toMatchObject({ ok: false, error: expect.stringMatching(/city/) });
    // Whatever a caller sends, saving strips it.
    const card = { ...manualToCard({ kind: "organization", name: "[Sample] Safe Harbor", organization: null, type: "shelters", phone: null, email: null, street: "100 Hidden St", city: "Chicago", state: "IL", zip: "60614", website: null, notes: null, npi: null }) };
    expect(card.facts.some((f) => f.field === "address")).toBe(true);
    const stripped = stripSensitive(card);
    expect(stripped).toMatchObject({ street: null, zip: null, city: "Chicago" });
    expect(stripped.facts.some((f) => f.field === "address")).toBe(false);
    expect(stripSensitive({ ...card, name: "[Sample] Elm Street Funeral Home", organization: null, type: "funeral_homes" }).street).toBe("100 Hidden St");
    // A name cue alone is enough, even with a harmless type.
    expect(stripSensitive({ ...card, type: "funeral_homes" }).street).toBeNull();
  });
  it("parses CSV: quotes, commas and line breaks inside quotes, a BOM, CRLF", () => {
    expect(parseCsv('\uFEFFname,notes\r\n"Smith, Jones & Co","said ""hi""\nthen left"\r\n\r\n')).toEqual([
      ["name", "notes"],
      ["Smith, Jones & Co", 'said "hi"\nthen left'],
    ]);
  });
  it("the template reads back as two good [Sample] rows", () => {
    const { rows, error } = readCsv(CSV_TEMPLATE);
    expect(error).toBeNull();
    expect(rows.map((r) => r.ok)).toEqual([true, true]);
    expect(rows.every((r) => r.raw.name.startsWith("[Sample]"))).toBe(true);
  });
  it("refuses a file without the columns, or too many rows", () => {
    expect(readCsv("foo,bar\n1,2").error).toMatch(/column names/);
    expect(readCsv(`name,type\n${"A,funeral_homes\n".repeat(201)}`).error).toMatch(/up to 200/);
  });
  it("matches existing cards by NPI, CMS number, name and address, name and city, or name at the same organization", () => {
    const cards = [
      { id: "npi", name: "Maria Rivera, MD", npi: "1900000001", npi_type: "individual" as const },
      { id: "org", name: "Gilda's Club Chicago", npi_type: "organization" as const, address: "537 N Wells St", zip: "60654", city: "Chicago", phone: "312-555-0100" },
      { id: "ccn", name: "Something Hospice", ccn: "141599", npi_type: "organization" as const },
      { id: "nav", name: "Jordan Ellis", organization: "Northside Hospital", npi_type: "individual" as const, city: "Chicago" },
    ];
    expect(findDuplicate({ npi: "1900000001", name: "Dr. Rivera", isOrg: false }, cards)?.card.id).toBe("npi");
    expect(findDuplicate({ ccn: "141599", name: "Other", isOrg: true }, cards)?.card.id).toBe("ccn");
    expect(findDuplicate({ name: "GILDA'S CLUB CHICAGO", isOrg: true, street: "537 North Wells Street", zip: "60654" }, cards)).toMatchObject({ card: { id: "org" }, how: "name_address" });
    // The same name in the same city with no street is only a possible duplicate: she decides.
    expect(findDuplicate({ name: "Gilda's Club Chicago", isOrg: true, city: "chicago" }, cards)).toMatchObject({ card: { id: "org" }, how: "possible" });
    // Apostrophes don't matter.
    expect(findDuplicate({ name: "Gildas Club Chicago", isOrg: true, street: "537 N Wells St", zip: "60654" }, cards)).toMatchObject({ card: { id: "org" }, how: "name_address" });
    // A phone alone never merges: the same name and phone at another street is someone new.
    expect(findDuplicate({ name: "Gilda's Club Chicago", isOrg: true, street: "1 Other St", zip: "60601", phone: "312-555-0100" }, cards)).toBeNull();
    expect(findDuplicate({ name: "Somebody Else", isOrg: true, phone: "312-555-0100", city: "Chicago" }, cards)).toBeNull();
    // Saint and St are one word.
    expect(findDuplicate({ name: "St. Joseph Hospice", isOrg: true, street: "2 Elm St", zip: "60614" }, [{ id: "sj", name: "Saint Joseph Hospice", npi_type: "organization", address: "2 Elm Street", zip: "60614" }])).toMatchObject({ card: { id: "sj" } });
    expect(findDuplicate({ name: "Jordan Ellis", organization: "Northside Hospital", isOrg: false }, cards)).toMatchObject({ card: { id: "nav" }, how: "name_org" });
    expect(findDuplicate({ name: "Jordan Ellis", organization: "Southside Clinic", isOrg: false }, cards)).toBeNull();
    expect(findDuplicate({ name: "Gilda's Club Evanston", isOrg: true, city: "Evanston" }, cards)).toBeNull();
  });
  it("found places become Found cards with their own source's evidence", () => {
    const [row] = parsePdc("hospice", hospice, AT);
    const c = orgToCard(row, 0.4);
    expect(c).toMatchObject({ foundVia: "cms_provider_data", ccn: "141599", npi: null, npiType: "organization", type: "hospice" });
    expect(c.facts[0].origin).toBe("cms_pdc");
    const m = manualToCard({ kind: "organization", name: "Gilda's Club Chicago", organization: null, type: "disease_orgs", phone: null, email: null, street: null, city: "Chicago", state: "IL", zip: null, website: null, notes: null, npi: null });
    expect(m.foundVia).toBe("manual");
    expect(m.facts.every((f) => f.origin === "clinician")).toBe(true);
  });
});

describe("do not contact without an NPI", () => {
  it("keys an organisation by name and street, or city; a person by name at their group", () => {
    expect(orgKeyOf({ name: "Gilda's Club Chicago LLC", npi_type: "organization", address: "537 North Wells Street, Suite 2", zip: "60654" })).toMatchObject({
      name_key: "gildas club chicago",
      street_key: "537 n wells st 60654",
    });
    expect(orgKeyOf({ name: "[Sample] Jordan Ellis, RN", organization: "Northside Hospital", npi_type: "individual", city: "Chicago" })).toMatchObject({ name_key: "jordan ellis at northside hospital", city_key: "chicago" });
  });
  it("matches the same place however it is written; two branches on different streets are different", () => {
    const listed = orgKeyOf({ name: "Fullerton Funeral Home", npi_type: "organization", address: "2401 N Lincoln Ave", zip: "60614", city: "Chicago" })!;
    expect(keyMatches(orgKeyOf({ name: "FULLERTON FUNERAL HOME", address: "2401 North Lincoln Avenue", zip: "60614" })!, listed)).toBe(true);
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home", city: "Chicago" })!, listed)).toBe(true);
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home", zip: "60614" })!, listed)).toBe(true);
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home", zip: "60601" })!, listed)).toBe(false);
    // No place in common is never a match ("match anything" is gone).
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home" })!, listed)).toBe(false);
    expect(orgKeyOf({ name: "x".repeat(600), npi_type: "organization", city: "Chicago" })!.org_key.length).toBeLessThanOrEqual(400);
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home", address: "10 W Main St", zip: "60601" })!, listed)).toBe(false);
    expect(keyMatches(orgKeyOf({ name: "Fullerton Funeral Home", city: "Evanston" })!, listed)).toBe(false);
  });
  it("near names, people at a listed office and anyone at its street are blocked; another city is not (Nov 3)", () => {
    const listed = orgKeyOf({ name: "[Test] Westside Oncology Partners", npi_type: "organization", address: "100 W Madison St", city: "Chicago", zip: "60602" })!;
    const m = (c: Parameters<typeof orgKeyOf>[0]) => keyMatches(orgKeyOf(c)!, listed);
    expect(m({ name: "[Test] West Side Oncology Partners", npi_type: "organization", address: "100 West Madison Street", city: "Chicago", zip: "60602" })).toBe(true);
    expect(m({ name: "[Test] Westside-Oncology, LLC", npi_type: "organization", city: "Chicago" })).toBe(true);
    expect(m({ name: "[Test] Pat Doe", organization: "[Test] Westside Oncology Partners", npi_type: "individual", address: "100 W Madison St", city: "Chicago", zip: "60602" })).toBe(true);
    expect(m({ name: "[Test] Pat Doe", organization: "[Test] West Side Oncology", npi_type: "individual", city: "Chicago" })).toBe(true);
    expect(m({ name: "[Test] Other Clinic", npi_type: "organization", address: "100 W. Madison St., Suite 4", city: "Chicago", zip: "60602" })).toBe(true);
    // Another branch in another city, or another name with no shared street, stays allowed.
    expect(m({ name: "[Test] Westside Oncology Partners", npi_type: "organization", address: "1 Main St", city: "Evanston", zip: "60201" })).toBe(false);
    expect(m({ name: "[Test] Eastside Oncology", npi_type: "organization", city: "Chicago" })).toBe(false);
    // One listed person doesn't block everyone in their building.
    const person = orgKeyOf({ name: "[Test] Jordan Ellis", organization: "Northside Hospital", npi_type: "individual", address: "2 Oak St", city: "Chicago", zip: "60614" })!;
    expect(keyMatches(orgKeyOf({ name: "Northside Hospital", npi_type: "organization", address: "2 Oak St", city: "Chicago", zip: "60614" })!, person)).toBe(false);
    expect(nameSuppressed({ name: "[Test] West Side Oncology", npi_type: "organization" }, { npis: new Set(), orgs: [listed] })).toBe(true);
  });
  it("isSuppressed checks the NPI list and the org keys; a debrief's who-else with only an organisation matches too", () => {
    const list: Suppressed = { npis: new Set(["1900000001"]), orgs: [orgKeyOf({ name: "Northside Hospice", npi_type: "organization", city: "Chicago" })!] };
    expect(isSuppressed({ npi: "1900000001", name: "Anyone" }, list)).toBe(true);
    expect(isSuppressed({ name: "Northside Hospice", npi_type: "organization", address: "1 Main St", zip: "60614", city: "Chicago" }, list)).toBe(true);
    // No place at all: not by the key, but a debrief's who-else is checked by name.
    expect(isSuppressed({ name: "Northside Hospice", organization: "Northside Hospice", npi_type: "organization" }, list)).toBe(false);
    expect(nameSuppressed({ name: "Northside Hospice", npi_type: "organization" }, list)).toBe(true);
    expect(nameSuppressed({ name: "Southside Hospice", npi_type: "organization" }, list)).toBe(false);
    expect(isSuppressed({ name: "Southside Hospice", npi_type: "organization", city: "Chicago" }, list)).toBe(false);
  });
});

describe("the contact log and the chat", () => {
  it("keeps every earlier kind and adds referred_out, which the log form doesn't offer", () => {
    expect(CONTACT_KINDS).toEqual(["called", "emailed", "met", "sent_letter", "replied", "note", "referred", "referred_out"]);
    expect(LOGGABLE_KINDS).not.toContain("referred_out");
  });
  it("the demo allows the new manual-add tool", () => {
    expect(REFERRAL_DEMO_TOOLS).toContain("add_referral_source");
    expect(REFERRAL_DEMO_TOOLS).toContain("find_referral_sources");
  });
});

describe("sensitive kinds: no street, ZIP, point or distance anywhere", () => {
  const STREET = /Hidden|100 /;
  it("marks DV/SA agencies and shelters by catalog type or plain name cue", () => {
    expect(isSensitiveSource({ type: "dv_sa_agencies" })).toBe(true);
    expect(isSensitiveSource({ source_type: "shelters" })).toBe(true);
    expect(isSensitiveSource({ name: "Northside Domestic Violence Center" })).toBe(true);
    expect(isSensitiveSource({ name: "Lakeside Rape Crisis Center" })).toBe(true);
    expect(isSensitiveSource({ organization: "Harbor Women's Shelter" })).toBe(true);
    // Shelters (any form), apostrophes straight or curly, plurals, and the named cues.
    for (const n of ["Harbor Shelters Inc", "Ruth’s House", "Ruth's House", "Safe Harbor Center", "The Safehouse Project", "Sarah's Safe House", "House of Hope Chicago",
      "Northside Sexual Abuse Program", "Family Violence Coalition", "Battered Women's Network", "Lakeview Women’s Center", "Haven House Services", "Refuge Ministries", "Sanctuary Outreach"])
      expect(isSensitiveSource({ name: n }), n).toBe(true);
    for (const n of ["Lakeview Family Medicine", "Gilda's Club Chicago", "Fullerton Funeral Home", "Haven"]) expect(isSensitiveSource({ name: n }), n).toBe(false);
    // One-way site hashes match however NPPES writes the street; never the street itself.
    const [a] = siteHashes("2400 N LINCOLN AVE", "60614-1234");
    expect(siteHashes("2400 n lincoln ave", "60614")).toContain(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(withoutDistance(["fit", "0.4 mi from your office", "on your block", "sees all ages"])).toEqual(["fit", "sees all ages"]);
  });
  it("the map search gives a sensitive provider no street, ZIP, point or distance, and no distance in its reasons", async () => {
    const base: Provider = {
      npi: "1999999990", name: "[Sample] Lakeview Counseling", organization: "[Sample] Lakeview Counseling", practiceName: "[Sample] Lakeview Counseling",
      npiType: "organization", credential: null, taxonomy: "1041C0700X", taxonomyLabel: "Social Worker, Clinical", specialty: "therapists",
      specialtyLabel: "Therapists", address: "2400 N Lincoln Ave", city: "Chicago", state: "IL", zip: "60614", phone: "312-555-0101", homeAddress: false, fax: null,
    } as Provider;
    const dv = { ...base, npi: "1999999991", npiType: "organization" as const, name: "[Sample] Harbor Domestic Violence Services", organization: "[Sample] Harbor Domestic Violence Services", practiceName: null, address: "100 Hidden Way", zip: "60614" };
    const result = await searchArea(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, specialties: ["therapists"] },
      { office: [41.92, -87.65], officeZip: "60614", state: "IL", focus: [] },
      { search: async () => ({ providers: [dv, base], requests: 1, truncated: false, timedOut: null }), geocode: async () => new Map(), centers: { "60614": [41.9224, -87.6533] } },
    );
    const p = result.providers.find((x) => x.npi === "1999999991")!;
    expect(p).toMatchObject({ sensitive: true, address: "", zip: "", lat: null, lon: null, distanceMiles: null });
    expect(JSON.stringify(p)).not.toMatch(STREET);
    expect(p.tier.reasons.join(" ")).not.toMatch(/\bmi\b|from your office|on your block|in your ZIP/i);
    expect(result.providers.find((x) => x.npi !== "1999999991")?.lat).not.toBeNull();
  });
  it("a discovery search strips a sensitive-named place too", async () => {
    const osm = async () => ({ orgs: [{ ...parseOsmOrgs(osmOrgs, ["funeral_homes"], [41.92, -87.65], AT).orgs[0], name: "[Sample] Harbor Women's Shelter" }], capped: [] });
    const r = await discoverOrgs({ area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["funeral_homes"] }, { office: [41.92, -87.65], officeZip: "60614", state: "IL" }, { osm, centers: { "60614": [41.9224, -87.6533] } });
    expect(r.orgs[0]).toMatchObject({ street: null, zip: null, lat: null, lon: null, distanceMiles: null });
  });
});
