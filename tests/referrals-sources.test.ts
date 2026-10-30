// Referrals v2 sources: the CMS Medicare files, the Illinois license list and
// OpenStreetMap, parsed from recorded replies (made-up providers, 555 phones,
// NPIs starting 19), and the re-check that asks them all.
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { checkCms, dacFacts, dacUrl, optOutFacts, orderReferringFacts } from "../lib/referrals/sources/cms";
import { SourceUnavailable } from "../lib/referrals/sources/http";
import { checkOsm, osmFacts, overpassQuery, searchWord } from "../lib/referrals/sources/osm";
import { checkStateLicense, ilDescription, ilFacts, ilUrl, lastNameFor } from "../lib/referrals/sources/state-license";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);
const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/referrals/sources/${name}`, import.meta.url), "utf8"));
const AT = "2026-10-29T12:00:00.000Z";
const NOW = new Date(AT);

describe("CMS Medicare files", () => {
  it("asks the Doctors and Clinicians file by NPI", () => {
    const u = new URL(dacUrl("1900000001"));
    expect(u.searchParams.get("conditions[0][property]")).toBe("npi");
    expect(u.searchParams.get("conditions[0][value]")).toBe("1900000001");
  });
  it("reads group, address and phone from the first row, and counts groups", () => {
    const facts = dacFacts("1900000001", fixture("cms-dac.json"), AT);
    const by = Object.fromEntries(facts.map((f) => [f.field, f]));
    expect(by.medicare.value).toBe("enrolled");
    expect(by.organization).toMatchObject({ value: "Northside Family Medicine LLC", detail: { groups: 2 } });
    expect(by.address.value).toBe("2400 N Lincoln Ave, Ste 210, Chicago, IL 60614");
    expect(by.phone.value).toBe("312-555-0100");
    expect(facts.every((f) => f.origin === "cms_dac" && f.method === "npi")).toBe(true);
  });
  it("ignores rows for another NPI and an empty reply", () => {
    expect(dacFacts("1900000002", fixture("cms-dac.json"), AT)).toEqual([]);
    expect(dacFacts("1900000001", { results: [] }, AT)).toEqual([]);
  });
  it("Order and Referring lists which benefits they may order for", () => {
    const [f] = orderReferringFacts("1900000001", fixture("cms-order-referring.json"), AT);
    expect(f).toMatchObject({ field: "medicare", origin: "cms_order_referring", detail: { mayOrderFor: ["PARTB", "DME", "PMD"] } });
  });
  it("an opt-out in effect is 'yes', a past one 'ended'", () => {
    expect(optOutFacts("1900000005", fixture("cms-opt-out.json"), AT, NOW)[0].value).toBe("yes");
    expect(optOutFacts("1900000005", fixture("cms-opt-out.json"), AT, new Date("2027-06-01"))[0].value).toBe("ended");
  });
  it("a file that refuses (403) is 'unavailable', not 'not found', and the others still count", async () => {
    const fetcher = async (url: string) => {
      if (url.includes("provider-data")) throw new SourceUnavailable("Medicare (data.cms.gov)", 403);
      return url.includes("c99b5865") ? fixture("cms-order-referring.json") : [];
    };
    const r = await checkCms("1900000001", { fetcher, now: NOW });
    expect(r.unavailable).toEqual(["Medicare clinician file"]);
    expect(r.checked).toEqual(["cms_order_referring", "cms_opt_out"]);
    expect(r.facts).toHaveLength(1);
  });
});

describe("Illinois license list", () => {
  it("picks the license from the credential, else the taxonomy", () => {
    expect(ilDescription("LCPC", null)).toBe("LICENSED CLINICAL PROFESSIONAL COUNSELOR");
    expect(ilDescription("L.C.S.W.", null)).toBe("LICENSED CLINICAL SOCIAL WORKER");
    expect(ilDescription(null, "103TC0700X")).toBe("CLINICAL PSYCHOLOGIST");
    expect(ilDescription(null, "207Q00000X")).toBe("LICENSED PHYSICIAN AND SURGEON");
    expect(ilDescription("APRN", "363LP0808X")).toBeNull();
  });
  it("quotes names safely and refuses odd ones", () => {
    expect(lastNameFor("Sean O'Neil, LCSW")).toBe("O'NEIL");
    expect(lastNameFor("x' OR 1=1 --")).toBeNull();
    const where = new URL(ilUrl("LICENSED CLINICAL SOCIAL WORKER", "O'NEIL", "Chicago")).searchParams.get("$where");
    expect(where).toBe("description='LICENSED CLINICAL SOCIAL WORKER' AND upper(last_name)='O''NEIL' AND upper(city)='CHICAGO'");
  });
  it("uses the one licensee whose first name fits", () => {
    const r = ilFacts({ name: "Priya Das, LCSW", credential: "LCSW", taxonomy: null, city: "Chicago", state: "IL", npiType: "individual" }, fixture("il-licenses.json"), AT);
    expect(r.facts[0]).toMatchObject({ field: "license_status", value: "ACTIVE", method: "name_city", detail: { expires: "03/31/2027" } });
  });
  it("two licensees who fit, or none, give no facts and say why", () => {
    const two = [...fixture("il-licenses.json"), { first_name: "PRIYA", last_name: "DAS", license_status: "ACTIVE", city: "CHICAGO" }];
    expect(ilFacts({ name: "Priya Das", credential: "LCSW", taxonomy: null, city: "Chicago", state: "IL", npiType: "individual" }, two, AT).note).toMatch(/More than one/);
    expect(ilFacts({ name: "Lena Brooks", credential: "LCSW", taxonomy: null, city: "Chicago", state: "IL", npiType: "individual" }, fixture("il-licenses.json"), AT).note).toMatch(/No matching/);
  });
  it("other states and groups aren't checked, and say so", async () => {
    const card = { name: "Priya Das", credential: "LCSW", taxonomy: null, city: "Madison", state: "WI", npiType: "individual" };
    expect((await checkStateLicense(card, { fetcher: async () => [] })).note).toMatch(/can't check WI/);
    expect((await checkStateLicense({ ...card, state: "IL", npiType: "organization" }, { fetcher: async () => [] })).checked).toBe(false);
  });
});

describe("OpenStreetMap", () => {
  it("searches a person's last name, a group's first words", () => {
    expect(searchWord("Maria Rivera-Lopez, MD", false)).toBe("lopez");
    expect(searchWord("Northside Family Medicine LLC", true)).toBe("Northside Family");
    expect(overpassQuery('Ri"vera', [41.925, -87.648], 400)).toContain('"name"~"Rivera",i](around:400,41.92500,-87.64800)');
  });
  it("takes website, phone and email from the matching place only", () => {
    const facts = osmFacts(
      { name: "Maria Rivera, MD", isOrg: false, street: "2400 N Lincoln Ave, Suite 210", zip: "60614", phone: "312-555-0100", point: [41.925, -87.648] },
      fixture("osm-overpass.json"),
      AT,
    );
    const by = Object.fromEntries(facts.map((f) => [f.field, f]));
    expect(by.website.value).toBe("https://riverafm.example");
    expect(by.phone.value).toBe("312-555-0199");
    expect(by.email).toMatchObject({ value: "office@riverafm.example", detail: { label: "on OpenStreetMap" } });
    expect(by.name.originUrl).toBe("https://www.openstreetmap.org/node/101");
  });
  it("a place with the name but far away and no address is not used", async () => {
    const reply = { elements: [{ type: "node", id: 9, lat: 42.1, lon: -87.9, tags: { name: "Maria Rivera", website: "https://x.example" } }] };
    const r = await checkOsm(
      { name: "Maria Rivera", isOrg: false, street: null, zip: "60614", phone: null, point: [41.925, -87.648], exact: false },
      { fetcher: async () => reply },
    );
    expect(r).toEqual({ facts: [], checked: true });
  });
});

describe.skipIf(!hasDb)("re-check against the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { recheckIfDue, recheckSource, staleSources } = await import("../lib/referrals/sources/recheck");
  const ids: string[] = [];
  afterAll(async () => {
    if (ids.length) await db()`delete from practice_os.referral_sources where id in ${db()(ids)}`;
    await closeDb();
  });

  async function card() {
    const [row] = await db()`
      insert into practice_os.referral_sources (npi, name, taxonomy, specialty, npi_type, credential, address, city, state, zip, phone)
      values ('1900000001', 'Maria Rivera, MD', '207Q00000X', 'Family medicine', 'individual', 'MD', '2400 N Lincoln Ave, Suite 210', 'Chicago', 'IL', '60614', '312-555-0100')
      on conflict (npi) do update set checked_at = null returning id`;
    if (!ids.includes(row.id)) ids.push(row.id);
    return row.id as string;
  }
  const deps = {
    nppes: async () => null,
    cms: async (url: string) => (url.includes("provider-data") ? fixture("cms-dac.json") : url.includes("c99b5865") ? fixture("cms-order-referring.json") : []),
    license: async () => [{ first_name: "MARIA", last_name: "RIVERA", license_status: "ACTIVE", city: "CHICAGO" }],
    osm: async () => fixture("osm-overpass.json"),
    geocode: async () => [41.925, -87.648] as [number, number],
    now: NOW,
  };

  it("asks every source, keeps each answer, and a registry miss flags the card", async () => {
    const id = await card();
    const r = await recheckSource(id, deps);
    expect(r.checked).toEqual(["nppes", "cms_dac", "cms_order_referring", "cms_opt_out", "state_license", "osm"]);
    const [row] = await db()`select confidence, checked_at, website, email from practice_os.referral_sources where id = ${id}`;
    expect(row.confidence).toBe("unconfirmed"); // the NPI isn't in the registry any more
    expect(row.website).toBe("https://riverafm.example");
    expect(row.email).toBe("office@riverafm.example");
    expect(row.checked_at.toISOString()).toBe(AT);
  });

  it("finds stale cards, and the daily run happens once a day", async () => {
    const id = await card();
    expect(await staleSources(50, db(), NOW)).toContain(id);
    // A day after any earlier run it is due; right after this one it isn't (audit_log is append-only).
    const later = new Date(Date.now() + 2 * 86_400_000);
    expect(await recheckIfDue({ ...deps, now: later }, db(), 1)).toBe(1);
    expect(await recheckIfDue({ ...deps, now: new Date() }, db(), 1)).toBeNull();
  });
});
