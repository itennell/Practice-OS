// The Nov 4 Referrals demo: the [Sample] oncology partners db:reset seeds, `npm run demo:warm`
// (searches once, keeps the answers in referral_fetch_cache) and `npm run demo:check` (plain
// PASS/FAIL lines). The database parts reset the demo and write rows, so they run ONLY against
// the built-in throwaway database on this computer (like tests/demo-reset.test.ts), never a
// shared one; warmDemo and checkDemo also refuse any project but SUPABASE_PROJECT_REF.
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { cardCategory, cardKind, checkDemo, checkRefusal, evaluateDemo, loadDemoSnapshot, type DemoCard, type DemoSnapshot } from "../lib/demo-check";
import { DEMO_NICHE, projectRefOf, resetDemoData } from "../lib/demo-reset";
import { categoryCounts, pickForBoard, warmDemo, warmRefusal } from "../lib/demo-warm";
import { parseResponses, clearNppesCache, type NppesResponse } from "../lib/referrals/nppes";
import { clearSourceCache } from "../lib/referrals/sources/cache";
import { pruneFetchCache } from "../lib/referrals/email/fetch";
import { geocodeKey, slimNppes, storedGeocoder, storedNppesFetcher } from "../lib/referrals/sources/stored-cache";
import type { AreaProvider, AreaResult } from "../lib/referrals/area";
import type { DiscoveredOrg, DiscoveryResult } from "../lib/referrals/orgs";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { latestLetters } = await import("../lib/referrals/store");

const dirs: string[] = [];
afterAll(async () => {
  for (const d of dirs) await rm(d, { recursive: true, force: true });
  if (local) {
    // The cache rows these tests wrote (all "Sample" searches and addresses).
    await db()`delete from practice_os.referral_fetch_cache where url like 'https://npiregistry.cms.hhs.gov/api/?%Sample%' or url like 'https://npiregistry.cms.hhs.gov/api/?%taxonomy_description=New%' or url like 'https://sample-site.example.com/%'`;
    await db()`delete from practice_os.referral_fetch_cache where url = any(${testGeoKeys})`;
    await closeDb();
  }
});
const testGeoKeys: string[] = [];

const SUPABASE = "postgresql://postgres.abcdefghij:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const BUILT_IN = "postgres://postgres:pw@127.0.0.1:54329/postgres";

describe("demo:warm and demo:check refuse a database SUPABASE_PROJECT_REF doesn't name", () => {
  it("say why in plain words", () => {
    expect(warmRefusal(BUILT_IN, "local")).toBeNull();
    expect(checkRefusal(SUPABASE, "abcdefghij")).toBeNull();
    expect(warmRefusal(SUPABASE, "local")).toMatch(/^Refusing to warm the demo: .*"abcdefghij"/);
    expect(checkRefusal(BUILT_IN, "abcdefghij")).toMatch(/^Refusing to check the demo: .*"local"/);
    expect(warmRefusal(BUILT_IN, undefined)).toMatch(/SUPABASE_PROJECT_REF is not set/);
    expect(checkRefusal("not a url", "local")).toMatch(/Refusing to check the demo/);
  });

  it("refuse before opening any connection", async () => {
    await expect(warmDemo({ url: SUPABASE, expectedRef: "local" })).rejects.toThrow(/Refusing to warm the demo/);
    await expect(checkDemo({ url: BUILT_IN, expectedRef: "abcdefghij" })).rejects.toThrow(/Refusing to check the demo/);
  });
});

const card = (over: Partial<DemoCard> = {}): DemoCard => ({
  name: "[Sample] Card",
  kind: "manual_sample",
  category: 11,
  miles: 1,
  sensitive: false,
  looksSensitive: false,
  hasAddress: false,
  doNotContact: false,
  ...over,
});

/** A ready demo: 24 cards near 60614 in 6 categories, from all four kinds of source. */
const NOW = new Date("2026-11-03T15:00:00Z");
const ready = (over: Partial<DemoSnapshot> = {}): DemoSnapshot => ({
  now: NOW,
  dryRunFiles: [{ file: ".env", value: "true" }],
  niche: DEMO_NICHE,
  approvalMode: "manual",
  latestChat: null,
  nppesPagesLastDay: 40,
  lastWarm: new Date("2026-11-03T13:00:00Z"),
  cards: [
    ...Array.from({ length: 6 }, (_, i) => card({ kind: "nppes", category: 2, miles: i * 0.5, hasAddress: true })),
    ...Array.from({ length: 6 }, () => card({ kind: "cms", category: 5, hasAddress: true })),
    ...Array.from({ length: 4 }, () => card({ kind: "osm", category: 12, hasAddress: true })),
    ...Array.from({ length: 4 }, () => card({ kind: "osm", category: 10, hasAddress: true })),
    ...Array.from({ length: 2 }, () => card({ category: 11 })),
    ...Array.from({ length: 2 }, () => card({ category: 6 })),
  ],
  lastReset: new Date("2026-11-03T12:00:00Z"),
  beforeReset: { conversations: 0, approvals: 0 },
  sinceReset: { conversations: 0, approvals: 0 },
  ...over,
});

const status = (lines: ReturnType<typeof evaluateDemo>, re: RegExp) => lines.find((l) => re.test(l.text))?.status;

describe("demo:check's lines", () => {
  it("all PASS on a ready demo", () => {
    const lines = evaluateDemo(ready());
    expect(lines.filter((l) => l.status !== "PASS")).toEqual([]);
    expect(status(lines, /24 cards within 5 miles of 60614, across 6 categories/)).toBe("PASS");
  });

  it("FAILs a niche, DRY_RUN, missing reset or stale warm, in plain words", () => {
    expect(evaluateDemo(ready()).some((l) => /REFERRALS_ONLY_DEMO/.test(l.text))).toBe(false);
    expect(status(evaluateDemo(ready({ niche: "grief_loss" })), /niche is "grief_loss"/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ niche: null })), /niche is not set/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ dryRunFiles: [{ file: ".env", value: "false" }] })), /DRY_RUN is "false" in \.env/)).toBe("FAIL");
    // .env.local wins over .env in Next.js: anything but true there FAILs, even with .env right.
    const local = evaluateDemo(ready({ dryRunFiles: [{ file: ".env.local", value: "0" }, { file: ".env", value: "true" }] }));
    expect(status(local, /DRY_RUN is "0" in \.env\.local\..*env files only/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ dryRunFiles: [] })), /DRY_RUN isn't set/)).toBe("WARN");
    expect(status(evaluateDemo(ready()), /DRY_RUN=true in \.env: .*env files only/)).toBe("PASS");
    expect(status(evaluateDemo(ready({ nppesPagesLastDay: 0 })), /No NPI Registry pages saved in the last 24 hours/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ lastWarm: null })), /demo:warm hasn't run/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ lastWarm: new Date("2026-11-02T10:00:00Z") })), /demo:warm last ran 29 hours ago/)).toBe("FAIL");
    expect(status(evaluateDemo(ready({ lastReset: null })), /No demo reset found/)).toBe("FAIL");
  });

  it("FAILs too few nearby cards or categories, and a missing source kind", () => {
    const far = ready();
    far.cards = far.cards.map((c, i) => (i < 6 ? { ...c, miles: 7 } : c));
    expect(status(evaluateDemo(far), /Only 18 cards within 5 miles/)).toBe("FAIL");
    const narrow = ready({ cards: ready().cards.map((c) => ({ ...c, category: c.kind === "manual_sample" ? 11 : 2 })) });
    expect(status(evaluateDemo(narrow), /across 2 categories \(need 20 across 5;/)).toBe("FAIL");
    const noOsm = ready({ cards: [...ready().cards.filter((c) => c.kind !== "osm"), ...Array.from({ length: 8 }, () => card({ kind: "nppes", category: 1 }))] });
    const lines = evaluateDemo(noOsm);
    expect(status(lines, /No card from OpenStreetMap/)).toBe("FAIL");
    expect(status(lines, /from the NPI Registry/)).toBe("PASS");
    const unknownMiles = ready({ cards: ready().cards.map((c) => ({ ...c, miles: null })) });
    expect(status(evaluateDemo(unknownMiles), /Only 0 cards/)).toBe("FAIL");
    // Do-not-contact cards don't count toward the 20.
    const dnc = ready({ cards: ready().cards.map((c, i) => (i < 5 ? { ...c, doNotContact: true } : c)) });
    expect(status(evaluateDemo(dnc), /Only 19 cards within 5 miles.*do-not-contact cards left out/)).toBe("FAIL");
  });

  it("FAILs a sensitive card with an address, marked or only named like one", () => {
    const marked = ready({ cards: [...ready().cards, card({ name: "[Sample] Safe Place", sensitive: true, hasAddress: true })] });
    expect(status(evaluateDemo(marked), /1 sensitive card shows an address: \[Sample\] Safe Place/)).toBe("FAIL");
    const named = ready({ cards: [...ready().cards, card({ name: "[Sample] Shelter", looksSensitive: true, hasAddress: true })] });
    expect(status(evaluateDemo(named), /sensitive card/)).toBe("FAIL");
    const cityOnly = ready({ cards: [...ready().cards, card({ sensitive: true, hasAddress: false })] });
    expect(status(evaluateDemo(cityOnly), /No domestic violence/)).toBe("PASS");
  });

  it("PASSes only Manual; WARNs (never FAILs) on Auto, Bypass and chats since the reset; FAILs chats from before it", () => {
    expect(status(evaluateDemo(ready()), /New chats start in Manual/)).toBe("PASS");
    expect(status(evaluateDemo(ready({ approvalMode: "bypass" })), /start in Bypass, not Manual/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ approvalMode: "auto" })), /start in Auto, not Manual/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ approvalMode: null })), /start in Auto, not Manual/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ latestChat: { mode: "bypass" } })), /latest chat is in Bypass/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ latestChat: { mode: null } })), /latest chat is in Manual/)).toBe("PASS");
    expect(status(evaluateDemo(ready({ approvalMode: "auto", latestChat: { mode: null } })), /latest chat is in Auto/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ sinceReset: { conversations: 2, approvals: 1 } })), /2 chats and 1 approval since the reset/)).toBe("WARN");
    expect(status(evaluateDemo(ready({ beforeReset: { conversations: 1, approvals: 0 } })), /from before the last reset are still there/)).toBe("FAIL");
  });

  it("knows where a card came from and its category", () => {
    expect(cardKind({ found_via: null, npi: "1234567890", ccn: null, osm_ref: null, is_sample: false })).toBe("nppes");
    expect(cardKind({ found_via: "nppes", npi: "1234567890", ccn: null, osm_ref: null, is_sample: false })).toBe("nppes");
    expect(cardKind({ found_via: "cms_provider_data", npi: null, ccn: "14A001", osm_ref: null, is_sample: false })).toBe("cms");
    expect(cardKind({ found_via: "osm", npi: null, ccn: null, osm_ref: "node/1", is_sample: false })).toBe("osm");
    expect(cardKind({ found_via: "manual", npi: null, ccn: null, osm_ref: null, is_sample: true })).toBe("manual_sample");
    expect(cardKind({ found_via: "manual", npi: null, ccn: null, osm_ref: null, is_sample: false })).toBe("other");
    expect(cardCategory({ source_type: "grief_centers", taxonomy: null })).toBe(11);
    expect(cardCategory({ source_type: null, taxonomy: "207RX0202X" })).toBe(2);
    expect(cardCategory({ source_type: null, taxonomy: null })).toBeNull();
  });
});

describe("demo:warm's plain parts", () => {
  it("counts by category and picks the nearest few of each kind, never a sensitive one", () => {
    expect(categoryCounts([{ specialty: "oncology" }, { specialty: "oncology" }], [{ type: "funeral_homes" }])).toEqual([
      { label: "Medical specialists", count: 2 },
      { label: "Life-transition and wellness businesses", count: 1 },
    ]);
    const items = [
      { k: "a", distanceMiles: 0.5 },
      { k: "a", distanceMiles: 1 },
      { k: "a", distanceMiles: 2 },
      { k: "a", distanceMiles: 3 },
      { k: "b", distanceMiles: 6 },
      { k: "b", distanceMiles: null },
      { k: "b", distanceMiles: 1, sensitive: true },
      { k: "c", distanceMiles: 4.9 },
    ];
    expect(pickForBoard(items, (i) => i.k).map((i) => `${i.k}${i.distanceMiles}`)).toEqual(["a0.5", "a1", "a2", "c4.9"]);
    // In tier order (the map's), the nearest still win.
    const tierOrder = [
      { k: "a", distanceMiles: 4 },
      { k: "a", distanceMiles: 3.5 },
      { k: "a", distanceMiles: 2 },
      { k: "a", distanceMiles: 0.2 },
    ];
    expect(pickForBoard(tierOrder, (i) => i.k).map((i) => i.distanceMiles)).toEqual([0.2, 2, 3.5]);
  });

  it("slims an NPPES page without changing what the map reads from it", () => {
    const page: NppesResponse = {
      result_count: 2,
      results: [
        {
          number: "1999999991",
          enumeration_type: "NPI-1",
          basic: { status: "A", first_name: "SAMPLE", last_name: "ONCOLOGIST", credential: "M.D.", last_updated: "2025-01-01", ...({ sex: "F", enumeration_date: "2010-01-01" } as object) },
          addresses: [
            { address_purpose: "MAILING", address_1: "PO BOX 1", city: "CHICAGO", state: "IL", postal_code: "606140000" },
            { address_purpose: "LOCATION", address_1: "1 SAMPLE PLAZA", address_2: "STE 2", city: "CHICAGO", state: "IL", postal_code: "606140000", telephone_number: "312-555-0100", fax_number: "312-555-0101" },
          ],
          taxonomies: [{ code: "207RX0202X", desc: "Internal Medicine, Medical Oncology", primary: true, ...({ license: "036000000", state: "IL" } as object) }],
          ...({ identifiers: [{ identifier: "x" }], endpoints: [{ endpoint: "x" }] } as object),
        },
        {
          number: "1999999992",
          enumeration_type: "NPI-2",
          basic: { status: "A", organization_name: "SAMPLE CANCER CENTER LLC", authorized_official_first_name: "PAT", authorized_official_last_name: "EXAMPLE" },
          addresses: [{ address_purpose: "LOCATION", address_1: "2 SAMPLE WAY", city: "CHICAGO", state: "IL", postal_code: "60614" }],
          taxonomies: [{ code: "207RX0202X", primary: true }],
          other_names: [
            { organization_name: "SAMPLE ONCOLOGY", code: "3", type: "Doing Business As" },
            { organization_name: "OLD NAME", code: "1" },
          ],
        },
      ],
    };
    const slim = slimNppes(page);
    expect(parseResponses([slim])).toEqual(parseResponses([page]));
    expect(parseResponses([slim])).toHaveLength(2);
    expect(JSON.stringify(slim)).not.toMatch(/identifiers|endpoints|MAILING|license|OLD NAME/);
    expect(slimNppes({ Errors: [{ description: "No valid search criteria" }] })).toEqual({ Errors: [{ description: "No valid search criteria" }] });
  });
});

// A fictional provider and two fictional places, standing in for the public sources.
const provider = (n: number, specialty: "oncology" | "palliative_care", miles: number): AreaProvider =>
  ({
    npi: `199999990${n}`,
    name: `[Sample] Test Provider ${n}, MD`,
    organization: null,
    practiceName: null,
    npiType: "individual",
    credential: "MD",
    taxonomy: specialty === "oncology" ? "207RX0202X" : "207RH0002X",
    taxonomyLabel: specialty,
    specialty,
    specialtyLabel: specialty === "oncology" ? "Oncology" : "Palliative care",
    address: `${n} Sample Plaza`,
    city: "Chicago",
    state: "IL",
    zip: "60614",
    phone: "312-555-0190",
    homeAddress: false,
    fax: null,
    official: null,
    lastUpdated: null,
    lat: 41.92,
    lon: -87.65,
    precision: "address",
    distanceMiles: miles,
    worksAt: null,
    tier: { tier: "first", score: 60, reasons: ["[Sample]"], specialty },
  }) as AreaProvider;

const place = (key: string, type: string, origin: "cms_pdc" | "osm", miles: number): DiscoveredOrg => ({
  key,
  type,
  name: `[Sample] Test ${type} ${key}`,
  street: "10 Sample St",
  city: "Chicago",
  state: "IL",
  zip: "60614",
  phone: "(312) 555-0199",
  website: null,
  ccn: origin === "cms_pdc" ? key.slice(4) : null,
  osmRef: origin === "osm" ? key.slice(4) : null,
  lat: 41.92,
  lon: -87.65,
  precision: "address",
  origin,
  originUrl: origin === "cms_pdc" ? "https://data.cms.gov/provider-data/dataset/yc9t-dgbk" : "https://www.openstreetmap.org/node/1",
  checkedAt: new Date().toISOString(),
  typeLabel: type,
  distanceMiles: miles,
  onBoard: null,
});

describe.skipIf(!local)("the demo on the built-in database", () => {
  const reset = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-demo-ready-"));
    dirs.push(dir);
    return resetDemoData({ url: process.env.DATABASE_URL!, expectedRef: "local", dir });
  };

  it("seeds the [Sample] oncology partners, fictional and city-level only, with lived-in histories", async () => {
    await reset();
    const sql = db();
    const samples = await sql<{ id: string; name: string; phone: string | null; email: string | null; address: string | null; zip: string | null; source_type: string | null; found_via: string | null; stage: string }[]>`
      select id::text, name, phone, email, address, zip, source_type, found_via, stage from practice_os.referral_sources where is_sample order by id`;
    const types = new Set(samples.map((s) => s.source_type));
    for (const t of ["disease_orgs", "grief_centers", "hospice", "nurse_navigators", "chaplains", "hospital_social_workers", "oncology"]) expect(types).toContain(t);
    for (const s of samples) {
      expect(s.name.startsWith("[Sample] ")).toBe(true);
      if (s.phone) expect(s.phone).toMatch(/555-01\d\d/);
      if (s.email) expect(s.email).toMatch(/@([a-z-]+\.)?example\.com$/);
    }
    const added = samples.filter((s) => s.id >= "00000000-0000-4000-8000-000000000207" && s.id <= "00000000-0000-4000-8000-000000000214");
    expect(added).toHaveLength(8);
    for (const s of added) expect({ address: s.address, zip: s.zip, found_via: s.found_via }).toEqual({ address: null, zip: null, found_via: "manual" });

    const log = await sql<{ source_id: string; kind: string; happened_on: string }[]>`
      select source_id::text, kind, happened_on::text from practice_os.referral_contacts order by source_id, happened_on`;
    const of = (id: string) => log.filter((l) => l.source_id === `00000000-0000-4000-8000-000000000${id}`).map((l) => l.kind);
    expect(of("207")).toEqual(["called"]); // five weeks ago, gone cold
    expect(of("208")).toEqual(["sent_letter"]);
    expect(of("209")).toEqual(["met", "replied", "referred"]);
    const [cold] = await sql`select (current_date - last_contacted_at::date) as days, next_follow_up_on from practice_os.referral_sources where id = '00000000-0000-4000-8000-000000000207'`;
    expect(cold.days).toBe(35);
    expect(cold.next_follow_up_on).toBeNull();

    // 208's letter is approved and marked sent; 205 (the debrief target) has an empty profile.
    const letters = await latestLetters(sql);
    expect(letters["00000000-0000-4000-8000-000000000208"]).toMatchObject({ status: "done", sent: true });
    // That letter is in the current letter style: the niche, her plans, phone and email, the demo sign-off, and the letter rules pass.
    const { checkLetter } = await import("../lib/referrals/outreach");
    const [sample] = await sql<{ letter: string; body: string }[]>`
      select payload ->> 'letter' as letter, preview ->> 'body' as body from practice_os.approvals where id = '00000000-0000-4000-8000-000000000910'`;
    for (const text of [sample.letter, sample.body]) {
      expect(text).toMatch(/^\[Sample\] Dear Marrowpine Grief Center team,/);
      expect(text).toMatch(/cancer, serious illness and the end of life/);
      expect(text).toMatch(/Aetna/);
      expect(text).toMatch(/BCBSIL application is pending/);
      expect(text).toContain("(312) 555-0142");
      expect(text).toContain("dana@example.com");
      expect(text).toContain("Dana Reyes, LCPC (fictional demo practice)");
      expect(checkLetter(text)).toEqual({ ok: true });
    }
    const [target] = await sql`
      select name, refers_via, referral_contact, populations, needs_from_therapist, waitlist, payer_mix, best_time, last_meeting_summary, connection_points, profile_updated_at
        from practice_os.referral_sources where id = '00000000-0000-4000-8000-000000000205'`;
    expect(target.name).toBe("[Sample] Quillmere Oncology Group");
    expect(Object.entries(target).filter(([k, v]) => k !== "name" && v !== null)).toEqual([]);
  });

  it("never keeps a DV shelter (or anyone at its street) from an NPPES page in referral_fetch_cache", async () => {
    const sql = db();
    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Sample+Shelter&postal_code=60614&limit=200&skip=${Date.now()}`;
    const page = async (): Promise<NppesResponse> => ({
      result_count: 3,
      results: [
        {
          number: "1999999981",
          enumeration_type: "NPI-2",
          basic: { status: "A", organization_name: "SAMPLE HOPE DOMESTIC VIOLENCE SHELTER" },
          addresses: [{ address_purpose: "LOCATION", address_1: "77 HIDDEN SAMPLE CT", city: "CHICAGO", state: "IL", postal_code: "60614" }],
          taxonomies: [{ code: "207RX0202X", primary: true }],
        },
        {
          number: "1999999982",
          enumeration_type: "NPI-1",
          basic: { status: "A", first_name: "SAMPLE", last_name: "COLOCATED" },
          addresses: [{ address_purpose: "LOCATION", address_1: "77 Hidden Sample Ct", city: "CHICAGO", state: "IL", postal_code: "60614" }],
          taxonomies: [{ code: "207RX0202X", primary: true }],
        },
        {
          number: "1999999983",
          enumeration_type: "NPI-2",
          basic: { status: "A", organization_name: "SAMPLE ONCOLOGY PARTNERS" },
          // Its DBA reads as a shelter: dropped too.
          other_names: [{ organization_name: "SAMPLE SAFE HOUSE", code: "3" }],
          addresses: [{ address_purpose: "LOCATION", address_1: "5 OTHER SAMPLE AVE", city: "CHICAGO", state: "IL", postal_code: "60614" }],
          taxonomies: [{ code: "207RX0202X", primary: true }],
        },
      ],
    });
    clearNppesCache();
    clearSourceCache();
    const got = await storedNppesFetcher(sql, page)(url);
    expect(got.results).toEqual([]);
    const [row] = await sql`select body from practice_os.referral_fetch_cache where url = ${url}`;
    expect(row.body).not.toMatch(/SHELTER|HIDDEN|Hidden|COLOCATED|SAFE HOUSE|1999999981/i);
    expect(JSON.parse(row.body)).toEqual({ result_count: 3, results: [] });
  });

  it("the website-page prune leaves stored NPPES and map-point rows alone; their own prune drops rows past their lifetime", async () => {
    const sql = db();
    const old = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    const nppesOld = `https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Old&skip=${Date.now()}`;
    const censusRecent = geocodeKey({ street: `${Date.now()} Old Sample St`, city: "Chicago", state: "IL", zip: "60614" });
    testGeoKeys.push(censusRecent);
    const pageOld = `https://sample-site.example.com/contact?${Date.now()}`;
    await sql`insert into practice_os.referral_fetch_cache (url, status, body, fetched_at) values
      (${nppesOld}, 200, '{}', ${old}), (${censusRecent}, 200, '[41.9,-87.6]', ${old}), (${pageOld}, 200, 'x', ${old})`;
    // The website-page prune lib/referrals/email/fetch.ts runs after it keeps a page.
    await pruneFetchCache(sql, Date.now());
    const left = async () => (await sql<{ url: string }[]>`select url from practice_os.referral_fetch_cache where url = any(${[nppesOld, censusRecent, pageOld]})`).map((r) => r.url).sort();
    expect(await left()).toEqual([censusRecent, nppesOld].sort());
    // A fresh NPPES write prunes NPPES rows past their day; map points (30 days) stay.
    clearNppesCache();
    clearSourceCache();
    await storedNppesFetcher(sql, async () => ({ result_count: 0, results: [] }))(`https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=New&skip=${Date.now()}`);
    expect(await left()).toEqual([censusRecent]);
  });

  it("demo:warm keeps NPPES pages and geocoded points in referral_fetch_cache across restarts", async () => {
    const sql = db();
    const url = `https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Sample&postal_code=60614&limit=200&skip=${Date.now()}`;
    let asked = 0;
    const page = async (): Promise<NppesResponse> => {
      asked++;
      return { result_count: 0, results: [] };
    };
    expect(await storedNppesFetcher(sql, page)(url)).toEqual({ result_count: 0, results: [] });
    clearNppesCache();
    clearSourceCache(); // as if the app restarted
    expect(await storedNppesFetcher(sql, page)(url)).toEqual({ result_count: 0, results: [] });
    expect(asked).toBe(1);

    const addr = { street: `${Date.now()} Sample St`, city: "Chicago", state: "IL", zip: "60614" };
    testGeoKeys.push(geocodeKey(addr));
    let geocoded = 0;
    const fake = async (list: (typeof addr)[]) => {
      geocoded += list.length;
      return new Map(list.map((a) => [`${a.street}|${a.city}|${a.state}|${a.zip}`.toLowerCase(), [41.92, -87.65] as [number, number]]));
    };
    const first = await storedGeocoder(sql, fake)([addr]);
    const again = await storedGeocoder(sql, fake)([addr]);
    expect([...again.values()]).toEqual([[41.92, -87.65]]);
    expect([...first.values()]).toEqual([...again.values()]);
    expect(geocoded).toBe(1);
    const [row] = await sql`select body from practice_os.referral_fetch_cache where url = ${geocodeKey(addr)}`;
    expect(JSON.parse(row.body)).toEqual([41.92, -87.65]);
  });

  it("demo:warm adds the nearest of each kind, and demo:check then passes", async () => {
    await reset();
    const search = async (): Promise<AreaResult> => ({
      label: "60614",
      center: [41.92, -87.65],
      zips: ["60614"],
      providers: [provider(1, "oncology", 0.4), provider(2, "oncology", 0.9), provider(3, "oncology", 1.2), provider(4, "oncology", 1.3), provider(5, "palliative_care", 2), provider(6, "palliative_care", 8)],
      requests: 3,
      notes: [],
    });
    const discover = async (): Promise<DiscoveryResult> => ({
      label: "60614",
      center: [41.92, -87.65],
      zips: ["60614"],
      types: ["hospice", "funeral_homes", "clergy"],
      orgs: [place("cms:14A001", "hospice", "cms_pdc", 1.1), place("cms:14A002", "home_health", "cms_pdc", 2.2), place("osm:node/9000000001", "funeral_homes", "osm", 0.6), place("osm:node/9000000002", "clergy", "osm", 0.3)],
      notes: ["CMS Home Health Care Agencies didn't answer. Try again in a minute."],
      attribution: [],
    });
    // Her context without the Census geocoder (her [Sample] office address never leaves the test).
    const empty = { npis: new Set<string>(), orgs: [] };
    const practice = async () => ({ office: null, officeZip: "60614", state: "IL", focus: [], suppressed: new Set<string>(), blocked: empty, niche: DEMO_NICHE });
    const placesContext = async () => ({ office: null, officeZip: "60614", state: "IL", suppressed: empty, niche: DEMO_NICHE });
    const deps = { search, discover, practice, placesContext };
    const report = await warmDemo({ url: process.env.DATABASE_URL!, expectedRef: "local", deps });
    expect(report.added).toEqual({ nppes: 4, cms: 2, osm: 2 });
    expect(report.failed.some((f) => /didn't answer/.test(f))).toBe(true);
    expect(report.categories[0]).toEqual({ label: "Medical specialists", count: 4 });
    expect({ map: report.mapMiles, places: report.placesMiles }).toEqual({ map: 5, places: 5 });
    expect(report.notKept).toEqual([]);

    // The fake search kept nothing, so one NPI Registry page stands in for the warm's.
    await db()`insert into practice_os.referral_fetch_cache (url, status, body, fetched_at)
      values (${`https://npiregistry.cms.hhs.gov/api/?version=2.1&taxonomy_description=Sample&skip=${Date.now()}`}, 200, '{}', now())`;
    const [{ approval_mode: savedMode }] = await db()`select approval_mode from practice_os.settings limit 1`;
    await db()`update practice_os.settings set approval_mode = 'manual'`;
    try {
      const snap = await loadDemoSnapshot(db(), { dryRunFiles: [{ file: ".env", value: "true" }] });
      const lines = evaluateDemo(snap);
      expect(lines.filter((l) => l.status !== "PASS")).toEqual([]);
      expect(snap.cards.filter((c) => c.kind === "nppes")).toHaveLength(4);
      expect(snap.lastReset).not.toBeNull();
      expect(snap.lastWarm).not.toBeNull();

      // A do-not-contact NPI is read from the 025 list and left out of the count.
      await db()`insert into practice_os.referral_suppressions (npi, reason) values ('1999999901', 'asked_not_to') on conflict do nothing`;
      const blocked = await loadDemoSnapshot(db(), { dryRunFiles: [{ file: ".env", value: "true" }] });
      expect(blocked.cards.filter((c) => c.doNotContact).map((c) => c.name)).toEqual(["[Sample] Test Provider 1, MD"]);
    } finally {
      await db()`delete from practice_os.referral_suppressions where npi = '1999999901'`;
      await db()`update practice_os.settings set approval_mode = ${savedMode}`;
    }
    // Warming twice adds nothing new (refreshed cards aren't counted).
    const again = await warmDemo({ url: process.env.DATABASE_URL!, expectedRef: "local", deps });
    expect(again.added).toEqual({ nppes: 0, cms: 0, osm: 0 });
  });
});
