// Referrals CRM final fixes against the database: a sensitive (DV/SA) card never shows up
// in the weekly plan's "reach out" or "going cold", and the Overview route sends approval
// times as ISO instants. It writes and deletes rows, so it runs ONLY against the built-in
// throwaway database on this computer, never a shared one named in .env. Fake data only.
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { outreachPlan } = await import("../lib/referrals/plan");
const { recentReferralApprovals } = await import("../lib/referrals/crm");

const made: string[] = [];
const approvals: string[] = [];

async function makeCard(name: string, opts: { stage: string; sensitive: boolean; lastOn?: string }) {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (name, organization, taxonomy, specialty, npi_type, city, state, stage, email, distance_miles, fit_score, is_sample, sensitive, last_contacted_at)
    values (${name}, ${name}, '207Q00000X', 'Family medicine', 'organization', 'Chicago', 'IL', ${opts.stage}, ${opts.sensitive ? null : "office@example.com"}, ${opts.sensitive ? null : 0.2}, 99, true, ${opts.sensitive}, ${opts.lastOn ?? null})
    returning id`;
  made.push(row.id);
  return row.id;
}

describe.skipIf(!local)("referrals CRM final fixes (built-in database only)", () => {
  afterAll(async () => {
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
    await closeDb();
  });

  it("a sensitive card is never in reach out or going cold; its twin can be", async () => {
    const safe = await makeCard("[Sample] Final Fix Shelter Services", { stage: "found", sensitive: true });
    const twin = await makeCard("[Sample] Final Fix Family Clinic", { stage: "found", sensitive: false });
    const coldSafe = await makeCard("[Sample] Final Fix Cold Shelter", { stage: "connected", sensitive: true, lastOn: "2025-01-01T12:00:00Z" });
    const plan = await outreachPlan(undefined, 1000);
    const reach = plan.reach_out.map((r) => r.id);
    expect(reach).not.toContain(safe);
    expect(reach).toContain(twin);
    expect(plan.going_cold.map((g) => g.id)).not.toContain(coldSafe);
  });

  it("Latest activity approvals carry ISO instants (the Overview route reads them)", async () => {
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.approvals (kind, title, preview, payload, status, created_by)
      values ('referral_letter', '[Sample] Final fix letter', '{}'::jsonb, '{}'::jsonb, 'pending', 'aeon') returning id`;
    approvals.push(row.id);
    const mine = (await recentReferralApprovals(db(), 50)).find((a) => a.id === row.id)!;
    expect(mine.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(Number.isNaN(new Date(mine.created_at).getTime())).toBe(false);
    expect(mine.decided_at).toBeNull();
  });
});
