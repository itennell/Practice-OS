// Referrals › Partners against the database: the four numbers on the page, and "Find
// email" refusing a sensitive organization and a set-aside partner before any lookup.
// It writes and deletes rows, so it runs ONLY against the built-in throwaway database on
// this computer, never a shared one named in .env. Fake data only.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { referralCounts } = await import("../lib/referrals/crm");
const { logContact } = await import("../lib/referrals/contacts");
const { practiceToday } = await import("../lib/compliance/store");
const { POST: findEmail } = await import("../app/api/referrals/[id]/find-email/route");

const made: string[] = [];

async function makeCard(name: string, opts: { stage?: string; sensitive?: boolean } = {}) {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (name, taxonomy, specialty, npi_type, city, state, zip, stage, distance_miles, is_sample, sensitive)
    values (${name}, '207Q00000X', 'Family medicine', 'organization', 'Chicago', 'IL', ${opts.sensitive ? null : "60614"}, ${opts.stage ?? "found"}, ${opts.sensitive ? null : 0.4}, true, ${opts.sensitive ?? false})
    returning id`;
  made.push(row.id);
  return row.id;
}

const post = (id: string) =>
  findEmail(
    new Request(`http://localhost:3000/api/referrals/${id}/find-email`, {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000", origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
      body: "{}",
    }),
    { params: Promise.resolve({ id }) } as never,
  );

describe.skipIf(!local)("referrals partners (built-in database only)", () => {
  afterAll(async () => {
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    await closeDb();
  });

  it("counts partners (not Not a fit), letters waiting and referrals in the last 30 days", async () => {
    const before = await referralCounts([{ stage: "found" }, { stage: "not_a_fit" }, { stage: "connected" }]);
    expect(before.partners).toBe(2);
    const id = await makeCard("[Sample] Partners Count Clinic", { stage: "connected" });
    const today = await practiceToday();
    await logContact(id, { kind: "referred", happenedOn: today, by: "clinician" });
    const after = await referralCounts([]);
    expect(after.referredThisMonth).toBe(before.referredThisMonth + 1);
    expect(after.waiting).toBeGreaterThanOrEqual(0);
    expect(typeof after.reachOut).toBe("number");
  });

  it("Find email refuses a sensitive organization and a set-aside partner, before any lookup", async () => {
    const dv = await makeCard("[Sample] Safe Harbor Shelter", { sensitive: true });
    const r1 = await post(dv);
    expect(r1.status).toBe(409);
    expect((await r1.json()).error).toMatch(/public line only/);
    const aside = await makeCard("[Sample] Set Aside Practice", { stage: "not_a_fit" });
    const r2 = await post(aside);
    expect(r2.status).toBe(409);
    // Neither was checked: no re-check claim in the audit log.
    const [n] = await db()<{ n: number }[]>`
      select count(*)::int as n from practice_os.audit_log where action = 'referral_recheck_started' and subject_id in ${db()([dv, aside])}`;
    expect(n.n).toBe(0);
  });
});
