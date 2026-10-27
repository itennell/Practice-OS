// Saved credentialing profile against the live database (runs only when
// DATABASE_URL is set). Each test restores Dana's seeded [Sample] profile.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const store = await import("../lib/credentialing/store");
const { currentCaqhPrep } = await import("../lib/credentialing/actions");

let original: Record<string, unknown> | null = null;

beforeAll(async () => {
  if (!hasDb) return;
  const [row] = await db()`select * from practice_os.credentialing_profile where id`;
  original = row ?? null;
});

afterEach(async () => {
  if (!hasDb || !original) return;
  const o = original;
  await db()`
    update practice_os.credentialing_profile set
      identity = ${db().json(o.identity as never)}, education = ${db().json(o.education as never)},
      license = ${db().json(o.license as never)}, npi = ${o.npi as string}, npi_type = ${o.npi_type as number},
      taxonomy = ${o.taxonomy as string}, tin = ${o.tin as string}, malpractice = ${db().json(o.malpractice as never)},
      practice_location = ${db().json(o.practice_location as never)}, work_history = ${db().json(o.work_history as never)},
      gap_explanations = ${db().json(o.gap_explanations as never)}, documents = ${db().json(o.documents as never)},
      npi_check = null, npi_checked_at = null
    where id`;
});

afterAll(async () => {
  if (hasDb) await closeDb();
});

describe.skipIf(!hasDb)("credentialing profile in the database", () => {
  it("has no column for a license number, and the database refuses one inside the license section", async () => {
    const cols = await db()<{ column_name: string }[]>`
      select column_name from information_schema.columns
       where table_schema = 'practice_os' and table_name = 'credentialing_profile'`;
    for (const { column_name } of cols) expect(column_name).not.toMatch(/license_?(no|num)/);
    await expect(
      db()`update practice_os.credentialing_profile set license = license || '{"number": "180.000001"}'::jsonb where id`,
    ).rejects.toThrow(/check/);
  });

  it("the app refuses a license number too", async () => {
    await expect(
      store.updateCredentialingSection("license", { type: "LCPC", state: "IL", board: "IDFPR", number: "180.000001" }, "test"),
    ).rejects.toThrow();
    await expect(
      store.updateCredentialingSection("license", { type: "LCPC 180.000001", state: "IL", board: "IDFPR" }, "test"),
    ).rejects.toThrow(/license numbers/);
  });

  it("malpractice renewed through Dec 2027 clears it from CAQH prep, and the change is audited", async () => {
    const before = await currentCaqhPrep();
    expect(before?.prep.items.some((i) => i.id === "doc_malpractice" && !i.done)).toBe(true);

    const p = (await store.loadCredentialingProfile())!;
    const values = store.sectionValues(p);
    await store.updateCredentialingSection("malpractice", { ...values.malpractice, expires_on: "2027-12-01" }, "test");
    await store.updateCredentialingSection(
      "documents",
      values.documents.map((d) => (d.id === "malpractice" ? { ...d, expires_on: "2027-12-01" } : d)),
      "test",
    );

    const after = await currentCaqhPrep();
    expect(after?.prep.items.find((i) => i.id === "doc_malpractice")).toBeUndefined();
    const [row] = await db()`
      select details from practice_os.audit_log
       where action = 'credentialing_updated' and details->>'section' = 'malpractice' order by id desc limit 1`;
    expect(row.details).toMatchObject({ section: "malpractice", by: "test" });
  });

  it("refuses an NPI with a bad check digit and a badly written tax ID", async () => {
    await expect(store.updateCredentialingSection("npi", { npi: "1999999902", npi_type: 1, taxonomy: "101YP2500X" }, "test")).rejects.toThrow(/NPI/);
    await expect(store.updateCredentialingSection("tin", { tin: "001234567" }, "test")).rejects.toThrow(/12-3456789/);
  });

  it("an NPPES check saves what the registry said (fake registry here)", async () => {
    const fakeFetch = (async () =>
      new Response(
        JSON.stringify({
          result_count: 1,
          results: [{ basic: { first_name: "DANA", last_name: "REYES" }, taxonomies: [{ code: "101YP2500X", primary: true }] }],
        }),
      )) as typeof fetch;
    const check = await store.checkNpiInRegistry(db(), fakeFetch);
    expect(check).toMatchObject({ found: true, name: "DANA REYES", matches: true });
    expect((await store.loadCredentialingProfile())?.npiCheck?.found).toBe(true);
  });
});

describe.runIf(hasDb && process.env.LIVE_NPPES === "1")("NPPES (live)", () => {
  it("the seeded sample NPI is not in the registry", async () => {
    expect((await store.checkNpiInRegistry()).found).toBe(false);
  });
});
