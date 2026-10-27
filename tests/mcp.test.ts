// queue_approval through a real MCP client over stdio, against the live database.
// Runs only when DATABASE_URL is set; deletes the rows it creates.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 1, prepare: false, onnotice: () => {} }) : null;
const client = new Client({ name: "Vitest MCP", version: "0.0.0" });
const created: string[] = [];

beforeAll(async () => {
  if (!sql) return;
  await client.connect(new StdioClientTransport({ command: "npx", args: ["tsx", "mcp/server.ts"], stderr: "pipe" }));
});

afterAll(async () => {
  if (!sql) return;
  if (created.length) await sql`delete from practice_os.approvals where id in ${sql(created)}`;
  await client.close();
  await sql.end({ timeout: 5 });
});

describe.skipIf(!sql)("queue_approval", () => {
  it("queues one pending approval, tagged with the client, and audits it", async () => {
    const result = await client.callTool({
      name: "queue_approval",
      arguments: { kind: "test_note", title: "[Sample] Queued over MCP", payload: { note: "[Sample] from vitest" } },
    });
    expect(result.isError).toBeFalsy();
    const { approval_id: id, status } = result.structuredContent as { approval_id: string; status: string };
    expect(result.content).toEqual([
      { type: "text", text: "queued for clinician approval" },
      { type: "text", text: `approval_id: ${id}` },
    ]);
    created.push(id);
    expect(status).toBe("pending");

    const [row] = await sql!`select status, created_by, kind, payload from practice_os.approvals where id = ${id}`;
    expect(row).toMatchObject({ status: "pending", created_by: "mcp:vitest-mcp", kind: "test_note" });
    const audit = await sql!`select action from practice_os.audit_log where approval_id = ${id}`;
    expect(audit.map((a) => a.action)).toEqual(["approval_queued"]);
  });

  it("rejects a kind the database doesn't allow", async () => {
    const result = await client
      .callTool({ name: "queue_approval", arguments: { kind: "wire_money", title: "x" } })
      .catch((err: Error) => ({ isError: true, content: [{ type: "text", text: err.message }] }));
    expect(result.isError).toBe(true);
  });

  it("ignores an attempt to set the status: the row is still pending", async () => {
    const result = await client.callTool({
      name: "queue_approval",
      arguments: { kind: "test_note", title: "[Sample] Tries to skip approval", status: "done" },
    });
    const { approval_id: id } = result.structuredContent as { approval_id: string };
    created.push(id);
    const [row] = await sql!`select status from practice_os.approvals where id = ${id}`;
    expect(row.status).toBe("pending");
  });

  it("rejects an oversized payload", async () => {
    const result = await client
      .callTool({
        name: "queue_approval",
        arguments: { kind: "test_note", title: "x", payload: { note: "a".repeat(25_000) } },
      })
      .catch((err: Error) => ({ isError: true, content: [{ type: "text", text: err.message }] }));
    expect(result.isError).toBe(true);
  });
});

describe.skipIf(!sql)("morning_brief", () => {
  it("is listed as read-only", async () => {
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "morning_brief");
    expect(tool?.annotations?.readOnlyHint).toBe(true);
  });

  it("returns this week's items, urgent ones just after, and a plain-text summary", async () => {
    const before = await sql!`select count(*)::int as n, max(updated_at) as at from practice_os.obligations`;
    const result = await client.callTool({ name: "morning_brief", arguments: {} });
    expect(result.isError).toBeFalsy();
    const brief = result.structuredContent as {
      today: string;
      this_week: { title: string; days_left: number }[];
      urgent_soon: { title: string; urgency: string; days_left: number }[];
      setup_questions: { title: string }[];
      is_sample: boolean;
      summary: string;
    };
    for (const i of brief.this_week) expect(i.days_left).toBeLessThanOrEqual(7);
    for (const i of brief.urgent_soon) expect(i).toMatchObject({ urgency: "red" });
    // Dana's demo: CAQH is red (9 days out) so it shows as urgent soon.
    expect([...brief.this_week, ...brief.urgent_soon].map((i) => i.title)).toContain(
      "CAQH re-attestation (Illinois: every 180 days)",
    );
    expect(brief.setup_questions.length).toBeGreaterThan(0);
    expect(brief.is_sample).toBe(true);
    expect(result.content).toEqual([{ type: "text", text: brief.summary }]);
    expect(brief.summary).toMatch(/\[Sample\]/);
    // Read-only: nothing changed.
    const after = await sql!`select count(*)::int as n, max(updated_at) as at from practice_os.obligations`;
    expect(after).toEqual(before);
  });
});

describe.skipIf(!sql)("admin tools", () => {
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const [first] = res.content as { type: string; text: string }[];
    return { isError: Boolean(res.isError), body: res.isError ? first.text : JSON.parse(first.text) };
  };

  it("update_facts saves a business fact, rebuilds the calendar, and refuses anything else", async () => {
    const [before] = await sql!`select ce_hours_done from practice_os.compliance_facts`;
    try {
      const { body } = await call("update_facts", { ce_hours_done: 24 });
      expect(body.updated).toEqual(["ce_hours_done"]);
      const [ce] = await sql!`select ce_done from practice_os.obligations where rule_id = 'il_lcpc_ce'`;
      expect(Number(ce.ce_done)).toBe(24);
      const refused = await call("update_facts", { client_name: "x" });
      expect(refused.isError).toBe(true);
    } finally {
      await sql!`update practice_os.compliance_facts set ce_hours_done = ${before.ce_hours_done}`;
      await call("update_facts", { ce_hours_done: Number(before.ce_hours_done) });
    }
  });

  it("answer_setup records an answer by rule id", async () => {
    const [before] = await sql!`select status, answered_on, next_ask_on from practice_os.obligations where rule_id = 'us_retirement_plan'`;
    try {
      const { body } = await call("answer_setup", { rule_id: "us_retirement_plan", answer: "not_yet" });
      expect(body).toMatchObject({ ok: true, status: "not_yet" });
    } finally {
      await sql!`update practice_os.obligations set status = ${before.status}, answered_on = ${before.answered_on}, next_ask_on = ${before.next_ask_on} where rule_id = 'us_retirement_plan'`;
    }
  });

  it("log_event lists the clocks, then starts one with a due date", async () => {
    const list = await call("log_event");
    expect(list.body.clocks.map((c: { rule_id: string }) => c.rule_id)).toContain("il_idfpr_address");
    const { body } = await call("log_event", { rule_id: "il_idfpr_address" });
    try {
      expect(body).toMatchObject({ ok: true, rule_id: "il_idfpr_address" });
      const [row] = await sql!`select kind, (due_on - started_on) as days from practice_os.obligations where rule_id = 'il_idfpr_address' and started_on = ${body.started_on}`;
      expect(row).toMatchObject({ kind: "clock", days: 14 });
      const unknown = await call("log_event", { rule_id: "not_a_clock" });
      expect(unknown.body.ok).toBe(false);
    } finally {
      await sql!`delete from practice_os.obligations where rule_id = 'il_idfpr_address' and kind = 'clock'`;
    }
  });

  it("research_state_rules refuses a state whose rules ship verified (Illinois)", async () => {
    const { body } = await call("research_state_rules", { topics: ["license_renewal"] });
    expect(body).toMatchObject({ ok: false });
    expect(body.error).toMatch(/Illinois rules already ship verified/);
  });

  it("recheck_rules re-reads a researched rule's source page and keeps it active", async () => {
    const { sampleResearch, TEST_RULE_ID } = await import("./helpers/researched-rule");
    const { rule } = sampleResearch("2026-10-27");
    await sql!`insert into practice_os.compliance_rules (id, jurisdiction, rule, evidence_level, checked_at)
      values (${TEST_RULE_ID}, 'IL', ${sql!.json(rule as never)}, 'page', now() - interval '200 days')
      on conflict (id) do update set checked_at = excluded.checked_at, status = 'active'`;
    try {
      const { body } = await call("recheck_rules", {});
      const mine = body.outcomes.find((o: { rule_id: string }) => o.rule_id === TEST_RULE_ID);
      expect(mine).toMatchObject({ result: "still_there", how: "page" });
      const [row] = await sql!`select status, checked_at > now() - interval '1 minute' as fresh from practice_os.compliance_rules where id = ${TEST_RULE_ID}`;
      expect(row).toMatchObject({ status: "active", fresh: true });
    } finally {
      await sql!`delete from practice_os.compliance_rules where id = ${TEST_RULE_ID}`;
      await call("update_facts", { ce_hours_done: 18 });
    }
  });
});
