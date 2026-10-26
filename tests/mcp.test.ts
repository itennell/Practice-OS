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
    expect(result.content).toEqual([{ type: "text", text: "queued for clinician approval" }]);
    const { approval_id: id, status } = result.structuredContent as { approval_id: string; status: string };
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
