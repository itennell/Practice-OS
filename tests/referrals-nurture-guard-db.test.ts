// Her notes about the people she refers to go through the REAL privacy guard
// (no mock): a note with a client's details is refused and nothing is saved;
// a professional note about the provider is kept. Built-in throwaway database
// only (like tests/demo-reset.test.ts). Fake data only.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { referOutNotesFor, saveReferOutNotes } = await import("../lib/referrals/refer-out");
const { forgetAllowlist } = await import("../lib/aeon/guard");

const made: string[] = [];

describe.skipIf(!local)("refer-out notes with the real privacy guard (built-in database only)", () => {
  afterAll(async () => {
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    forgetAllowlist();
    await closeDb();
  });

  it("refuses a client detail and keeps a professional note", async () => {
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.referral_sources (name, specialty, npi_type, city, state, stage, is_sample)
      values ('[Sample] Dr. Guardtest Example, PsyD', 'Psychologist', 'individual', 'Chicago', 'IL', 'connected', true) returning id`;
    made.push(row.id);
    forgetAllowlist();
    await expect(
      saveReferOutNotes(row.id, { availability: "Maria Lopez, born 03/14/1988, needs Tuesday evenings for her depression" }),
    ).rejects.toThrow(/name|birth date|diagnosis|client/i);
    expect((await referOutNotesFor([row.id]))[row.id]).toBeUndefined();
    const saved = await saveReferOutNotes(row.id, { availability: "Openings on Tuesday evenings", insurance: "BCBS PPO and Aetna" });
    expect(saved).toMatchObject({ availability: "Openings on Tuesday evenings", insurance: "BCBS PPO and Aetna" });
  }, 120_000);
});
