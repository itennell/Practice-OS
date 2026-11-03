// Migration 045 and the discovery cards against a database: organisations with
// no NPI on the do-not-contact list (left out of the plan, searches, letters
// and a debrief's "who else"), sensitive cards saved without a street, the CSV
// import's matching, and referred_out keeping a date and a count only. It runs
// DDL, so it runs ONLY against the built-in throwaway database on this
// computer (like tests/demo-reset.test.ts), never a shared one named in .env.
import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import hospice from "./fixtures/referrals/sources/cms-hospice.json" with { type: "json" };
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const okGuard = async (t: string) => ({ ok: true as const, text: t });

describe.skipIf(!local)("migration 045 and discovery cards (built-in database only)", async () => {
  const { addManual, commitImport, previewImport, saveOrgCard, orgToCard } = await import("../lib/referrals/org-store");
  const { readManual } = await import("../lib/referrals/manual");
  const { suppress, unsuppress, suppressionFor, suppressedList, nameSuppressed, logContact, contactsFor } = await import("../lib/referrals/contacts");
  const { outreachPlan } = await import("../lib/referrals/plan");
  const { blockedReason } = await import("../lib/referrals/outreach");
  const { discoverOrgs } = await import("../lib/referrals/orgs");
  const { parsePdc } = await import("../lib/referrals/sources/cms-agencies");
  const ids: string[] = [];
  const track = (id: string) => (ids.push(id), id);

  afterAll(async () => {
    if (ids.length) await db()`delete from practice_os.referral_sources where id in ${db()(ids)}`;
    await db()`delete from practice_os.referral_sources where name like '[Test045]%'`;
    await db()`delete from practice_os.referral_suppressions_org where name_key like 'test045%'`;
    await closeDb();
  });

  const manual = (raw: Record<string, unknown>) => {
    const r = readManual(raw);
    if (!r.ok) throw new Error(r.error);
    return r.input;
  };

  async function shape() {
    const q = (t: string) => db()<{ conname: string; def: string }[]>`
      select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = ${`practice_os.${t}`}::regclass order by conname`;
    return { contacts: await q("referral_contacts"), sources: await q("referral_sources"), facts: await q("referral_facts"), dnc: await q("referral_suppressions_org") };
  }

  it("applies again without changing anything, keeps every earlier kind and origin, and turns RLS on", async () => {
    const before = await shape();
    const body = await readFile(new URL("../db/migrations/045_referral_dnc_org.sql", import.meta.url), "utf8");
    await db().unsafe(body);
    expect(await shape()).toEqual(before);
    const kind = before.contacts.find((c) => c.conname === "referral_contacts_kind_check")!.def;
    for (const k of ["called", "emailed", "met", "sent_letter", "replied", "note", "referred", "referred_out"]) expect(kind).toContain(`'${k}'`);
    const origin = before.facts.find((c) => c.conname === "referral_facts_origin_check")!.def;
    for (const o of ["nppes", "cms_dac", "cms_order_referring", "cms_opt_out", "state_license", "osm", "website", "clinician", "cms_pdc"]) expect(origin).toContain(`'${o}'`);
    const [rls] = await db()<{ relrowsecurity: boolean }[]>`select relrowsecurity from pg_class where oid = 'practice_os.referral_suppressions_org'::regclass`;
    expect(rls.relrowsecurity).toBe(true);
  });

  it("referred_out keeps a date and a count only: no note, and no column for anything about a client", async () => {
    const r = await addManual(manual({ name: "[Test045] Out Referral Group", type: "therapists", city: "Chicago" }), { check: okGuard });
    const id = track(r.id);
    const logged = await logContact(id, { kind: "referred_out", note: "Referred Jane, 34, for grief", count: 2, by: "clinician" }, db(), okGuard);
    expect(logged.contact).toMatchObject({ kind: "referred_out", note: null, people_count: 2 });
    expect((await contactsFor([id]))[id][0]).toMatchObject({ note: null, people_count: 2 });
    await expect(db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, note, created_by, people_count) values (${id}, 'referred_out', current_date, 'a name', 'clinician', 1)`).rejects.toThrow(/referred_out_date_and_count/);
    await expect(db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, created_by, people_count) values (${id}, 'called', current_date, 'clinician', 3)`).rejects.toThrow(/count_only_referred_out/);
    const cols = await db()<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'practice_os' and table_name = 'referral_contacts' order by column_name`;
    expect(cols.map((c) => c.column_name)).toEqual(["created_at", "created_by", "happened_on", "id", "is_sample", "kind", "note", "people_count", "source_id"]);
    await expect(logContact(id, { kind: "referred_out", count: 0, by: "clinician" }, db(), okGuard)).rejects.toThrow(/from 1 to 20/);
  });

  it("a sensitive card is saved with its city only, whatever the caller sent; the database refuses a street", async () => {
    const card = orgToCard(
      { key: "x", type: "dv_sa_agencies", name: "[Test045] Safe Harbor", street: "100 Hidden St", city: "Chicago", state: "IL", zip: "60614", phone: "312-555-0111", website: null, ccn: null, osmRef: null, lat: 41.9, lon: -87.6, precision: "address", origin: "osm", originUrl: "https://www.openstreetmap.org/node/1", checkedAt: new Date().toISOString() },
      0.5,
    );
    const r = await saveOrgCard({ ...card, foundVia: "manual" });
    track(r.id);
    const [row] = await db()<{ address: string | null; zip: string | null; city: string | null; sensitive: boolean }[]>`select address, zip, city, sensitive from practice_os.referral_sources where id = ${r.id}`;
    expect(row).toEqual({ address: null, zip: null, city: "Chicago", sensitive: true });
    const facts = await db()<{ field: string }[]>`select field from practice_os.referral_facts where source_id = ${r.id}`;
    expect(facts.map((f) => f.field)).not.toContain("address");
    await expect(db()`update practice_os.referral_sources set address = '100 Hidden St' where id = ${r.id}`).rejects.toThrow(/sensitive_no_street/);
  });

  it("the CSV import matches existing cards and never adds them twice", async () => {
    const first = await addManual(manual({ name: "[Test045] Lakeside Cancer Support", type: "disease_orgs", city: "Chicago", phone: "312-555-0142" }), { check: okGuard });
    track(first.id);
    const csv = [
      "name,type,city,phone,street,zip",
      "[Test045] Lakeside Cancer Support,disease_orgs,Chicago,,,",
      "[Test045] Riverside Grief Center,grief_centers,Chicago,312-555-0150,,",
      "[Test045] Riverside Grief Center,grief_centers,Chicago,312-555-0150,,",
      "[Test045] Broken Row,not_a_kind,Chicago,,,",
    ].join("\n");
    const preview = await previewImport(csv);
    expect(preview.rows.map((r) => r.status)).toEqual(["possible", "new", "matched", "error"]);
    expect(preview.rows[0].matched).toMatchObject({ id: first.id, label: expect.stringMatching(/same city.*you choose/) });
    const done = await commitImport(csv, [], { check: okGuard });
    expect(done.added.map((a) => a.name)).toEqual(["[Test045] Riverside Grief Center"]);
    done.added.forEach((a) => track(a.id));
    const again = await commitImport(csv, [], { check: okGuard });
    expect(again.added).toEqual([]);
    // The possible duplicate is added only when she ticks "Add anyway".
    const anyway = await commitImport(csv, [], { check: okGuard, include: [2] });
    expect(anyway.added.map((x) => x.name)).toEqual(["[Test045] Lakeside Cancer Support"]);
    anyway.added.forEach((x) => track(x.id));
    const [{ n }] = await db()<{ n: number }[]>`select count(*)::int as n from practice_os.referral_sources where name = '[Test045] Riverside Grief Center'`;
    expect(n).toBe(1);
    const [manualCard] = await db()<{ found_via: string }[]>`select found_via from practice_os.referral_sources where id = ${done.added[0].id}`;
    expect(manualCard.found_via).toBe("manual");
  });

  it("do-not-contact without an NPI: kept by org key, and left out of the plan, searches, letters and a debrief's who-else", async () => {
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, organization, taxonomy, specialty, npi_type, address, city, state, zip, distance_miles, fit_score, score_version, found_via)
      values ('[Test045] Northside Family Clinic', '[Test045] Northside Family Clinic', '207Q00000X', 'Family medicine', 'organization', '2401 N Lincoln Ave', 'Chicago', 'IL', '60614', 0.1, 95, 3, 'manual')
      returning id`;
    const id = track(row.id);
    const before = await outreachPlan(db(), 50, { specialties: ["family_medicine"] });
    expect(before.reach_out.map((r) => r.id)).toContain(id);

    await suppress(id, "asked_not_to");
    expect(await suppressionFor(id)).toBe("asked_not_to");
    const [dnc] = await db()<{ org_key: string; street_key: string }[]>`select org_key, street_key from practice_os.referral_suppressions_org where name_key = 'test045 northside family clinic'`;
    expect(dnc).toMatchObject({ street_key: "2401 n lincoln ave 60614" });

    // The plan.
    await db()`update practice_os.referral_sources set stage = 'found' where id = ${id}`;
    const after = await outreachPlan(db(), 50, { specialties: ["family_medicine"] });
    expect(after.reach_out.map((r) => r.id)).not.toContain(id);
    // Letters.
    const [card] = await db()`select name, npi, stage, organization, npi_type, address, city, zip from practice_os.referral_sources where id = ${id}`;
    expect(await blockedReason(card as never)).toMatch(/do-not-contact list/);
    // A search finding the same place, written differently.
    const list = await suppressedList();
    const found = parsePdc("hospice", hospice, new Date().toISOString()).map((o, i) => (i === 0 ? { ...o, name: "[Test045] NORTHSIDE FAMILY CLINIC", street: "2401 North Lincoln Avenue", zip: "60614" } : o));
    const r = await discoverOrgs(
      { area: { kind: "zips", zips: ["60614"] }, radiusMiles: 1, types: ["hospice"] },
      { office: null, officeZip: "60614", state: "IL", suppressed: list },
      { cms: async () => ({ orgs: found, unavailable: [] }), centers: { "60614": [41.9224, -87.6533] } },
    );
    expect(r.orgs.some((o) => /northside family clinic/i.test(o.name))).toBe(false);
    expect(r.orgs.length).toBe(1);
    // A debrief's who-else naming only the organisation, as the debrief checks it.
    expect(nameSuppressed({ name: "[Test045] Northside Family Clinic", organization: "[Test045] Northside Family Clinic", npi_type: "organization" }, list)).toBe(true);
    // Adding it again by hand is refused.
    const again = await addManual(manual({ name: "[Test045] Northside Family Clinic", type: "family_medicine", city: "Chicago" }), { check: okGuard });
    expect(again.refused).toMatch(/do-not-contact/);

    await unsuppress(id);
    expect(await suppressionFor(id)).toBeNull();
    expect((await suppressedList()).orgs.some((o) => o.name_key === "test045 northside family clinic")).toBe(false);
  });

  it("a sensitive card never gives out a street, ZIP, point or distance: board, evidence, tiers, chat tools", async () => {
    const { saveSources, listSources, getSource } = await import("../lib/referrals/store");
    const { evidenceFor } = await import("../lib/referrals/evidence/store");
    const { tiersWithLog, cardView } = await import("../lib/referrals/plan");
    const { REFERRAL_TOOLS } = await import("../lib/referrals/../aeon/tools-referrals");
    const p = {
      npi: "1999999992", name: "[Test045] Harbor Domestic Violence Services", organization: "[Test045] Harbor Domestic Violence Services", practiceName: null,
      npiType: "organization" as const, credential: null, taxonomy: "251S00000X", taxonomyLabel: "Community Behavioral Health", specialty: "therapists" as const,
      specialtyLabel: "Therapists", address: "100 Hidden Way", city: "Chicago", state: "IL", zip: "60614", phone: "312-555-0177", homeAddress: false, fax: null,
      distanceMiles: 0.3, fitScore: 60,
    };
    await saveSources([p as never]);
    const card = (await listSources()).find((c) => c.npi === "1999999992")!;
    track(card.id);
    const [raw] = await db()<{ address: string | null; zip: string | null; sensitive: boolean; distance_miles: number | null }[]>`
      select address, zip, sensitive, distance_miles::float8 as distance_miles from practice_os.referral_sources where id = ${card.id}`;
    expect(raw).toEqual({ address: null, zip: null, sensitive: true, distance_miles: null });
    expect(card).toMatchObject({ address: null, zip: null, distance_miles: null, sensitive: true, city: "Chicago" });
    expect(await getSource(card.id)).toMatchObject({ address: null, zip: null, distance_miles: null });
    const ev = (await evidenceFor([card]))[card.id];
    expect(ev.fields.address).toBeUndefined();
    const tier = tiersWithLog([card], {}, { focus: [], clinicianState: "IL" })[card.id];
    expect(tier.reasons.join(" ")).not.toMatch(/\bmi\b|from your office|on your block|in your ZIP/i);
    expect(JSON.stringify(await cardView(card.id))).not.toMatch(/Hidden|60614/);
    const run = async (name: string, input: unknown) => (await REFERRAL_TOOLS.find((t) => t.name === name)!.run(input as never, { by: "test" } as never)).content[0].text;
    const found = await run("find_referral_cards", { query: "Harbor Domestic Violence" });
    expect(found).toContain("public line only");
    expect(found).not.toMatch(/Hidden|60614|"miles"/);
    // Even a later NPPES refresh can't put the street back.
    await saveSources([{ ...p, name: "[Test045] Harbor Services" } as never]);
    const [again] = await db()<{ address: string | null; sensitive: boolean }[]>`select address, sensitive from practice_os.referral_sources where id = ${card.id}`;
    expect(again).toEqual({ address: null, sensitive: true });
  });

  it("the migration backfills: an existing shelter loses its street, ZIP, distance and address evidence", async () => {
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, organization, npi_type, address, city, state, zip, distance_miles)
      values ('[Test045] Lakeshore Women’s Shelter', null, 'organization', '77 Quiet Ln', 'Chicago', 'IL', '60614', 0.4) returning id`;
    const id = track(row.id);
    const [plain] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, npi_type, address, city, state, zip) values ('[Test045] Lakeshore Family Practice', 'organization', '1 Main St', 'Chicago', 'IL', '60614') returning id`;
    track(plain.id);
    await db()`insert into practice_os.referral_facts (source_id, field, value, origin, match_method) values (${id}, 'address', '77 Quiet Ln, Chicago, IL 60614', 'nppes', 'npi'), (${id}, 'phone', '312-555-0100', 'nppes', 'npi')`;
    const body = await readFile(new URL("../db/migrations/045_referral_dnc_org.sql", import.meta.url), "utf8");
    await db().unsafe(body);
    const [after] = await db()<{ sensitive: boolean; address: string | null; zip: string | null; distance_miles: number | null; site_hashes: string[] | null }[]>`
      select sensitive, address, zip, distance_miles, site_hashes from practice_os.referral_sources where id = ${id}`;
    expect(after).toMatchObject({ sensitive: true, address: null, zip: null, distance_miles: null });
    const { siteHashes } = await import("../lib/referrals/sensitive");
    // The SQL hash is one of the app's, so a person NPPES lists at 77 Quiet Ln is marked too.
    expect(siteHashes("77 Quiet Ln", "60614")).toContain(after.site_hashes![0]);
    const facts = await db()<{ field: string }[]>`select field from practice_os.referral_facts where source_id = ${id}`;
    expect(facts.map((f) => f.field)).toEqual(["phone"]);
    const [other] = await db()<{ sensitive: boolean; address: string | null }[]>`select sensitive, address from practice_os.referral_sources where id = ${plain.id}`;
    expect(other).toEqual({ sensitive: false, address: "1 Main St" });
  });

  it("the app's cue list catches every name the SQL one does, and more (Nov 3)", async () => {
    const { looksSensitive } = await import("../lib/referrals/sensitive");
    const names = ["Harbor Shelters Inc", "Ruth’s House", "Safe Harbor Center", "The Safehouse Project", "House of Hope Chicago", "Northside Sexual Abuse Program",
      "Family Violence Coalition", "Battered Women's Network", "Lakeview Women's Center", "Haven House Services", "Refuge Ministries", "Rape Crisis Line",
      "Lakeview Family Medicine", "Gilda's Club Chicago", "Fullerton Funeral Home", "Haven", "Shelter", "House of Ruth",
      "[Test] Survivors Healing Center", "[Test] Hope House Chicago", "Lakeview Safe Place"];
    for (const n of names) {
      const [r] = await db()<{ v: boolean }[]>`select practice_os.name_looks_sensitive(${n}) as v`;
      if (r.v) expect(looksSensitive(n), n).toBe(true);
    }
    for (const n of ["Lakeview Family Medicine", "Gilda's Club Chicago", "Fullerton Funeral Home"]) expect(looksSensitive(n), n).toBe(false);
  });

  it("re-flags old cards the new cues catch, spreads only from a sensitive kind, and audits each one (no migration)", async () => {
    const insert = async (name: string, npiType: string, address: string, type: string | null = null) => {
      const [row] = await db()<{ id: string }[]>`
        insert into practice_os.referral_sources (name, npi_type, address, city, state, zip, distance_miles, source_type)
        values (${name}, ${npiType}, ${address}, 'Chicago', 'IL', '60614', 0.3, ${type}) returning id`;
      return track(row.id);
    };
    const org = await insert("[Test045] Survivors Healing Center", "organization", "1200 W Fullerton Ave");
    const hope = await insert("[Test045] Hope House Chicago", "organization", "9 Elm St");
    // A name cue doesn't spread: someone else at the Survivors street keeps theirs.
    const nextDoor = await insert("[Test045] Robin Nearby", "individual", "1200 West Fullerton Avenue");
    const agency = await insert("[Test045] Quiet Street Agency", "organization", "44 Birch St", "dv_sa_agencies");
    const atAgency = await insert("[Test045] Sam Example", "individual", "44 Birch Street");
    const plain = await insert("[Test045] Fullerton Family Dental", "organization", "500 W Fullerton Ave");
    const oncology = await insert("[Test045] Cancer Survivors Network", "organization", "7 Pine St");
    await db()`insert into practice_os.referral_facts (source_id, field, value, origin, match_method) values (${org}, 'address', '1200 W Fullerton Ave, Chicago, IL 60614', 'osm', 'name_address')`;
    const { reflagSensitive, knownSensitiveSites } = await import("../lib/referrals/sensitive-sites");
    expect(await reflagSensitive(db())).toBeGreaterThanOrEqual(4);
    const rows = await db()<{ id: string; sensitive: boolean; address: string | null; zip: string | null; distance_miles: number | null; site_hashes: string[] | null }[]>`
      select id, sensitive, address, zip, distance_miles, site_hashes from practice_os.referral_sources where id in ${db()([org, hope, nextDoor, agency, atAgency, plain, oncology])}`;
    const by = new Map(rows.map((r) => [r.id, r]));
    for (const id of [org, hope, agency, atAgency]) expect(by.get(id)).toMatchObject({ sensitive: true, address: null, zip: null, distance_miles: null });
    expect(by.get(org)!.site_hashes).toBeNull();
    expect(by.get(agency)!.site_hashes?.length).toBeGreaterThan(0);
    expect(by.get(nextDoor)).toMatchObject({ sensitive: false, address: "1200 West Fullerton Avenue" });
    expect(by.get(plain)).toMatchObject({ sensitive: false, address: "500 W Fullerton Ave" });
    expect(by.get(oncology)).toMatchObject({ sensitive: false, address: "7 Pine St" });
    const facts = await db()<{ field: string }[]>`select field from practice_os.referral_facts where source_id = ${org}`;
    expect(facts).toEqual([]);
    const audits = await db()<{ subject_id: string; reason: string }[]>`
      select subject_id::text, details ->> 'reason' as reason from practice_os.audit_log
       where action = 'referral_reflagged_sensitive' and subject_id::text in ${db()([org, hope, agency, atAgency])}`;
    expect(Object.fromEntries(audits.map((a) => [a.subject_id, a.reason]))).toEqual({ [org]: "name", [hope]: "name", [agency]: "kind", [atAgency]: "site" });
    // Nothing left to change; the sites list now has the agency's street.
    expect(await reflagSensitive(db())).toBe(0);
    const { siteHashes } = await import("../lib/referrals/sensitive");
    const known = await knownSensitiveSites(db());
    expect(siteHashes("44 Birch St", "60614").some((h) => known.has(h))).toBe(true);
    expect(siteHashes("1200 W Fullerton Ave", "60614").some((h) => known.has(h))).toBe(false);
    // Once per cue version and 10 minutes, not on every read: a card added the old way waits for the next run.
    const late = await insert("[Test045] Sarah's Inn", "organization", "3 Ash St");
    await knownSensitiveSites(db());
    const [before] = await db()<{ sensitive: boolean }[]>`select sensitive from practice_os.referral_sources where id = ${late}`;
    expect(before.sensitive).toBe(false);
    expect(await reflagSensitive(db())).toBe(1);
  });

  it("an NPPES person at a known sensitive site is saved sensitive, with no street", async () => {
    const { saveSources } = await import("../lib/referrals/store");
    const base = {
      organization: null, practiceName: null, credential: "LCSW", taxonomy: "1041C0700X", taxonomyLabel: "Social Worker, Clinical", specialty: "therapists" as const,
      specialtyLabel: "Therapists", city: "Chicago", state: "IL", zip: "60614", phone: null, homeAddress: false, fax: null, distanceMiles: 0.2, fitScore: 50,
    };
    // A shelter by kind marks people NPPES lists at its street.
    const { siteHashes } = await import("../lib/referrals/sensitive");
    const [shelter] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, npi_type, city, state, source_type, sensitive, site_hashes)
      values ('[Test045] Quiet Harbor Shelter', 'organization', 'Chicago', 'IL', 'shelters', true, ${siteHashes("88 Harbor Rd", "60614")}) returning id`;
    track(shelter.id);
    await saveSources([{ ...base, npi: "1999999971", name: "[Test045] Robin Example", npiType: "individual", address: "88 HARBOR ROAD" } as never]);
    // A name cue (round 2 review) is sensitive itself, but neither keeps hashes nor marks its neighbours.
    await saveSources([{ ...base, npi: "1999999970", name: "[Test045] Bayview Safe House", npiType: "organization", address: "12 Bay Rd" } as never]);
    await saveSources([{ ...base, npi: "1999999972", name: "[Test045] Sam Neighbour", npiType: "individual", address: "12 BAY ROAD" } as never]);
    const rows = await db()<{ npi: string; id: string; sensitive: boolean; address: string | null; distance_miles: number | null; site_hashes: string[] | null }[]>`
      select npi, id, sensitive, address, distance_miles, site_hashes from practice_os.referral_sources where npi in ('1999999970', '1999999971', '1999999972') order by npi`;
    rows.forEach((r) => track(r.id));
    expect(rows.map((r) => [r.npi, r.sensitive, r.address, r.distance_miles, r.site_hashes])).toEqual([
      ["1999999970", true, null, null, null],
      ["1999999971", true, null, null, null],
      ["1999999972", false, "12 BAY ROAD", "0.2", null],
    ]);
  });

  it("summarize leaves a sensitive card's address evidence out, so recheck and email answers never carry it", async () => {
    const { summarize } = await import("../lib/referrals/evidence/store");
    const r = await addManual(manual({ name: "[Test045] Quiet Harbor Agency", type: "dv_sa_agencies", city: "Chicago" }), { check: okGuard });
    const id = track(r.id);
    await db()`insert into practice_os.referral_facts (source_id, field, value, origin, match_method) values (${id}, 'address', '5 Secret St, Chicago, IL 60614', 'osm', 'name_address')`;
    const ev = await summarize(id);
    expect(ev.fields.address).toBeUndefined();
    expect(JSON.stringify(ev)).not.toMatch(/Secret St/);
  });

  it("suppress writes the NPI and the org key; a later card for the same place with no NPI is blocked; unsuppress removes only this card's key", async () => {
    const [a] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (npi, name, organization, npi_type, address, city, state, zip, found_via)
      values ('1999999960', '[Test045] Elm Grove Clinic', '[Test045] Elm Grove Clinic', 'organization', '10 Elm St', 'Chicago', 'IL', '60614', 'nppes') returning id`;
    const [b] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, organization, npi_type, address, city, state, zip, found_via)
      values ('[Test045] Elm Grove Clinic', '[Test045] Elm Grove Clinic', 'organization', '99 Oak St', 'Evanston', 'IL', '60201', 'manual') returning id`;
    track(a.id);
    track(b.id);
    await suppress(a.id, "not_interested");
    await suppress(b.id, "not_interested");
    expect((await db()`select 1 from practice_os.referral_suppressions where npi = '1999999960'`).length).toBe(1);
    const keys = await db()<{ org_key: string }[]>`select org_key from practice_os.referral_suppressions_org where name_key = 'test045 elm grove clinic' order by org_key`;
    expect(keys).toHaveLength(2);
    const blocked = await addManual(manual({ name: "[Test045] Elm Grove Clinic", type: "family_medicine", street: "10 Elm Street", zip: "60614", city: "Chicago" }), { check: okGuard });
    expect(blocked.refused).toMatch(/do-not-contact/);
    await unsuppress(a.id);
    const left = await db()<{ org_key: string }[]>`select org_key from practice_os.referral_suppressions_org where name_key = 'test045 elm grove clinic'`;
    expect(left.map((k) => k.org_key)).toEqual([keys.find((k) => k.org_key.includes("60201"))!.org_key]);
    await unsuppress(b.id);
  });

  it("referred_out needs a count: the database refuses one without", async () => {
    const r = await addManual(manual({ name: "[Test045] Count Check Group", type: "therapists", city: "Chicago" }), { check: okGuard });
    const id = track(r.id);
    await expect(db()`insert into practice_os.referral_contacts (source_id, kind, happened_on, created_by) values (${id}, 'referred_out', current_date, 'clinician')`).rejects.toThrow(/referred_out_date_and_count/);
  });
});
