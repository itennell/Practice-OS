// Migration 043: referral_settings takes any well-formed specialty id (the
// catalog checks the list in code) and a niche preset, and refuses badly formed
// ones. It runs DDL, so it runs ONLY against the built-in throwaway database on
// this computer (like tests/demo-reset.test.ts), never a shared one named in .env.
import { readFile } from "node:fs/promises";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { saveReferralSettings } = await import("../lib/referrals/settings");

type Row = { home_zip: string | null; specialties: string[]; niche_preset: string | null };

async function schemaShape() {
  const constraints = await db()<{ conname: string; def: string }[]>`
    select conname, pg_get_constraintdef(oid) as def from pg_constraint
    where conrelid = 'practice_os.referral_settings'::regclass and contype = 'c' order by conname`;
  const columns = await db()<{ column_name: string; data_type: string; is_nullable: string }[]>`
    select column_name, data_type, is_nullable from information_schema.columns
    where table_schema = 'practice_os' and table_name = 'referral_settings' order by column_name`;
  return { constraints, columns };
}

describe.skipIf(!local)("migration 043: referral catalog settings (built-in database only)", () => {
  let saved: Row | null = null;

  afterAll(async () => {
    if (saved) {
      await db()`update practice_os.referral_settings set home_zip = ${saved.home_zip}, specialties = ${saved.specialties}, niche_preset = ${saved.niche_preset} where id`;
    } else {
      await db()`delete from practice_os.referral_settings where id`;
    }
    await closeDb();
  });

  it("is idempotent: running it twice leaves the constraints and columns unchanged", async () => {
    const [row] = await db()<Row[]>`select home_zip, specialties, niche_preset from practice_os.referral_settings where id`;
    saved = row ?? null;
    const sql = await readFile(new URL("../db/migrations/043_referral_catalog.sql", import.meta.url), "utf8");
    const before = await schemaShape(); // the test database was migrated once at setup
    await db().unsafe(sql);
    const once = await schemaShape();
    await db().unsafe(sql);
    const twice = await schemaShape();
    expect(once).toEqual(before);
    expect(twice).toEqual(before);
    expect(before.columns.find((c) => c.column_name === "niche_preset")).toMatchObject({ data_type: "text", is_nullable: "YES" });
    expect(before.constraints.map((c) => c.conname)).toEqual(expect.arrayContaining(["referral_settings_specialties_check", "referral_settings_niche_preset_check"]));
  });

  it("saves new kinds and a niche preset, through the settings code", async () => {
    await saveReferralSettings({ specialties: ["psychiatry", "hospice", "palliative_care", "genetic_counselors"], nichePreset: "oncology_serious_illness" });
    const [row] = await db()<Row[]>`select specialties, niche_preset from practice_os.referral_settings where id`;
    expect(row.specialties).toContain("hospice");
    expect(row.niche_preset).toBe("oncology_serious_illness");
    await saveReferralSettings({ nichePreset: null });
    const [cleared] = await db()<Row[]>`select specialties, niche_preset from practice_os.referral_settings where id`;
    expect(cleared.niche_preset).toBeNull();
    expect(cleared.specialties).toContain("hospice");
  });

  it("the settings code refuses ids the catalog doesn't have", async () => {
    await expect(saveReferralSettings({ specialties: ["not_a_kind"] })).rejects.toThrow(/Pick from the list/);
    await expect(saveReferralSettings({ nichePreset: "not_a_niche" })).rejects.toThrow(/Pick a niche/);
  });

  it("the database refuses badly formed ids", async () => {
    await expect(db()`update practice_os.referral_settings set specialties = ${["Hospice"]} where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set specialties = ${["ok", "drop table"]} where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set specialties = array[null]::text[] where id`).rejects.toThrow(/specialties_check/);
    await expect(db()`update practice_os.referral_settings set niche_preset = 'Grief & loss' where id`).rejects.toThrow(/niche_preset_check/);
  });
});
