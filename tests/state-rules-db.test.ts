// Researched rules end to end against the live database: queue, approve, save,
// show on the calendar, confirm. Runs only when DATABASE_URL is set; removes
// everything it adds (audit_log rows stay; it is append-only).
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { TEST_RULE_ID, sampleResearch } from "./helpers/researched-rule";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { db, closeDb } = await import("../lib/db");
const { approve } = await import("../lib/approvals");
const { queueStateRules, confirmRule } = await import("../lib/compliance/researched");
const { practiceToday, syncCalendar } = await import("../lib/compliance/store");

const approvals: string[] = [];

afterAll(async () => {
  if (!hasDb) return;
  await db()`delete from practice_os.compliance_rules where id = ${TEST_RULE_ID}`;
  if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
  await syncCalendar();
  await closeDb();
});

describe.skipIf(!hasDb)("researched state rules", () => {
  it("approving saves the rule; it shows on the calendar marked for confirming; confirming makes it hers", async () => {
    const today = await practiceToday();
    const { ctx, results } = sampleResearch(today);
    const id = await queueStateRules(ctx, results, "test");
    expect(id).toBeTruthy();
    approvals.push(id as string);

    const [pending] = await db()`select kind, status, preview from practice_os.approvals where id = ${id}`;
    expect(pending).toMatchObject({ kind: "state_rules", status: "pending" });
    expect(pending.preview.rules[0]).toMatchObject({ title: "[Sample] Researched rule for tests", evidence: "page" });

    const res = await approve(id as string, { by: "test" });
    expect(res.ok && res.approval.status).toBe("done");

    const [saved] = await db()`select verified_by, evidence_level, status from practice_os.compliance_rules where id = ${TEST_RULE_ID}`;
    expect(saved).toMatchObject({ verified_by: "agent", evidence_level: "page", status: "active" });
    const [ob] = await db()`select kind, verified_by, evidence, due_on::text from practice_os.obligations where rule_id = ${TEST_RULE_ID}`;
    expect(ob).toMatchObject({ kind: "deadline", verified_by: "agent", evidence: "page" });

    expect(await confirmRule(TEST_RULE_ID, "test")).toEqual({ ok: true, rule_id: TEST_RULE_ID });
    await syncCalendar();
    const [after] = await db()`select verified_by from practice_os.obligations where rule_id = ${TEST_RULE_ID}`;
    expect(after.verified_by).toBe("clinician");
    expect(await confirmRule(TEST_RULE_ID, "test")).toEqual({ ok: false, reason: "already_confirmed" });
    expect(await confirmRule("il_lcpc_renewal", "test")).toEqual({ ok: false, reason: "not_researched" });
  });

  it("re-checks the payload on approval: a tampered rule claiming to be maintainer-verified is refused", async () => {
    const today = await practiceToday();
    const { ctx, results } = sampleResearch(today);
    const id = (await queueStateRules(ctx, results, "test")) as string;
    approvals.push(id);
    const [row] = await db()`select payload from practice_os.approvals where id = ${id}`;
    row.payload.rules[0] = { ...row.payload.rules[0], id: "il_lcpc_sample_tampered", verified_by: "maintainer" };
    await db()`update practice_os.approvals set payload = ${db().json(row.payload)} where id = ${id}`;
    const res = await approve(id, { by: "test" });
    expect(res.ok && res.approval.result).toMatchObject({ saved: 0, refused: [{ id: "il_lcpc_sample_tampered" }] });
    const found = await db()`select 1 from practice_os.compliance_rules where id = 'il_lcpc_sample_tampered'`;
    expect(found).toHaveLength(0);
  });
});
