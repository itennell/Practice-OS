// Manual, Auto and Bypass (lib/approval-policy.ts): the plain-code rule for what
// runs without her tap, then the same rule end to end against the database.
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { BAA_IN_PLACE, capForMcp, KIND_POLICY, shouldAutoRun, withOrigin } from "../lib/approval-policy";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

describe("the rule", () => {
  it("gives every approval kind a helper box and a tier", () => {
    expect(Object.keys(KIND_POLICY).sort()).toEqual([...APPROVAL_KINDS].sort());
  });

  it("Manual runs nothing; Auto runs routine work only; Bypass runs all but clinician-only", () => {
    for (const kind of APPROVAL_KINDS) {
      const tier = KIND_POLICY[kind].tier;
      expect(shouldAutoRun(kind, { mode: "manual" }), `${kind} manual`).toBe(false);
      expect(shouldAutoRun(kind, { mode: "auto" }), `${kind} auto`).toBe(tier === "routine");
      expect(shouldAutoRun(kind, { mode: "bypass" }), `${kind} bypass`).toBe(tier !== "clinician_only");
    }
  });

  it("anything handed to a client never runs on its own before a BAA, whatever the mode", () => {
    expect(BAA_IN_PLACE).toBe(false);
    expect(KIND_POLICY.gfe_issue.tier).toBe("clinician_only");
    for (const mode of ["manual", "auto", "bypass"] as const) expect(shouldAutoRun("gfe_issue", { mode })).toBe(false);
  });

  it("with no origin (her own buttons, scripts) nothing auto-runs", () => {
    for (const kind of APPROVAL_KINDS) expect(shouldAutoRun(kind, undefined)).toBe(false);
  });

  it("Front Desk follows its own rule: a missed-caller text, only while the switch is on", () => {
    expect(shouldAutoRun("sms_reply", { rule: "front_desk", rules: { text_missed_callers: true } })).toBe(true);
    expect(shouldAutoRun("sms_reply", { rule: "front_desk", rules: { text_missed_callers: false } })).toBe(false);
    expect(shouldAutoRun("instagram_post", { rule: "front_desk", rules: { text_missed_callers: true } })).toBe(false);
  });

  it("outside agents over MCP never get Bypass", () => {
    expect([capForMcp("manual"), capForMcp("auto"), capForMcp("bypass")]).toEqual(["manual", "auto", "auto"]);
  });

  it("no clinician-only executor can reach Gmail or Twilio (Aeon never sends to a patient)", () => {
    for (const kind of APPROVAL_KINDS.filter((k) => KIND_POLICY[k].tier === "clinician_only")) {
      const src = readFileSync(new URL(`../lib/executors/${kind}.ts`, import.meta.url), "utf8");
      expect(src, kind).not.toMatch(/twilio|gmail|sendMail|messages\.create|fetch\(/i);
    }
  });
});

const { closeDb, db } = await import("../lib/db");
const { approve, queueApproval } = await import("../lib/approvals");
const { runTool } = await import("../lib/aeon/tools");
const made: string[] = [];
const bills: string[] = [];

afterAll(async () => {
  if (!hasDb) return;
  if (bills.length) await db()`delete from practice_os.superbills where id in ${db()(bills)}`;
  if (made.length) await db()`delete from practice_os.approvals where id in ${db()(made)}`;
  await closeDb();
});

async function statusOf(id: string) {
  const [r] = await db()<{ status: string; decided_by: string | null }[]>`select status, decided_by from practice_os.approvals where id = ${id}`;
  return r;
}

describe.skipIf(!hasDb)("end to end", () => {
  it("Auto runs a routine approval at once and says so; Manual leaves it pending", async () => {
    const auto = await withOrigin({ mode: "auto" }, () => queueApproval({ kind: "test_note", title: "[Sample] auto", payload: { note: "x" }, createdBy: "test" }));
    const manual = await withOrigin({ mode: "manual" }, () => queueApproval({ kind: "test_note", title: "[Sample] manual", payload: { note: "x" }, createdBy: "test" }));
    made.push(auto, manual);
    expect(await statusOf(auto)).toMatchObject({ status: "done", decided_by: "auto:auto" });
    expect(await statusOf(manual)).toMatchObject({ status: "pending", decided_by: null });
    const [a] = await db()`select actor from practice_os.audit_log where approval_id = ${auto} and action = 'approval_auto_run'`;
    expect(a?.actor).toBe("aeon");
  });

  it("Bypass still leaves a Good Faith Estimate for her", async () => {
    const id = await withOrigin({ mode: "bypass" }, () => queueApproval({ kind: "gfe_issue", title: "[Sample] gfe", payload: {}, createdBy: "test" }));
    made.push(id);
    expect((await statusOf(id)).status).toBe("pending");
  });

  it("Manual turns a change into an aeon_action she approves; then it runs once", async () => {
    const r = await runTool(
      "draft_superbill",
      { lines: [{ date_of_service: "2026-10-05", cpt: "90837", modifier: "95", pos: "10", cents: 17_500 }] },
      { by: "test", mode: "manual" },
    );
    const out = JSON.parse(r.content[0].text);
    expect(out.waiting_for_her).toBe(true);
    made.push(out.approval_id);
    const before = await db()`select count(*)::int as n from practice_os.superbills where created_by = 'test'`;
    const done = await approve(out.approval_id, { by: "test" });
    expect(done.ok && done.approval.status).toBe("done");
    const after = await db()<{ id: string }[]>`select id from practice_os.superbills where created_by = 'test' order by created_at desc`;
    expect(after.length).toBe(before[0].n + 1);
    bills.push(after[0].id);
  });

  it("memories save in Manual without a tap", async () => {
    const r = await runTool("remember", { kind: "fact", text: "[Sample] Office closes at 6 on Fridays (test)" }, { by: "test", mode: "manual" });
    expect(r.content[0].text).not.toMatch(/waiting_for_her/);
    await db()`delete from practice_os.memories where text like '[Sample] Office closes at 6 on Fridays (test)%'`;
  });
});
