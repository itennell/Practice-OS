// Migration 043 on the built-in test database: referral_settings takes any
// well-formed specialty id (the catalog checks the list in code) and a niche
// preset, and refuses badly formed ones. Runs only when DATABASE_URL is set.
import { afterAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const hasDb = Boolean(process.env.DATABASE_URL);
const { closeDb, db } = await import("../lib/db");

describe.skipIf(!hasDb)("migration 043: referral catalog settings", () => {
  let saved: { home_zip: string | null; specialties: string[]; niche_preset: string | null } | null = null;

  afterAll(async () => {
    if (saved) {
      await db()`update practice_os.referral_settings set home_zip = ${saved.home_zip}, specialties = ${saved.specialties}, niche_preset = ${saved.niche_preset} where id`;
    } else {
      await db()`delete from practice_os.referral_settings where id`;
    }
    await closeDb();
  });

  it("applies, and running it again changes nothing", async () => {
    const [row] = await db()<{ home_zip: string | null; specialties: string[]; niche_preset: string | null }[]>`
      select home_zip, specialties, niche_preset from practice_os.referral_settings where id`;
    saved = row ?? null;
    const sql = await readFile(new URL("../db/migrations/043_referral_catalog.sql", import.meta.url), "utf8");
    await db().unsafe(sql);
    const cols = await db()`select column_name from information_schema.columns where table_schema = 'practice_os' and table_name = 'referral_settings' and column_name = 'niche_preset'`;
    expect(cols).toHaveLength(1);
  });

  it("saves new kinds and a niche preset", async () => {
    await db()`
      insert into practice_os.referral_settings (id, specialties, niche_preset)
      values (true, ${["psychiatry", "hospice", "palliative_care", "genetic_counselors"]}, 'oncology_serious_illness')
      on conflict (id) do update set specialties = excluded.specialties, niche_preset = excluded.niche_preset`;
    const [row] = await db()`select specialties, niche_preset from practice_os.referral_settings where id`;
    expect(row.specialties).toContain("hospice");
    expect(row.niche_preset).toBe("oncology_serious_illness");
    await db()`update practice_os.referral_settings set niche_preset = null where id`;
  });

  it("refuses badly formed ids", async () => {
    await expect(db()`update practice_os.referral_settings set specialties = ${["Hospice"]} where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set specialties = ${["ok", "drop table"]} where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set specialties = array[null]::text[] where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set niche_preset = 'Grief & loss' where id`).rejects.toThrow(/niche_preset_check/);
  });
});
