import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("design tokens", () => {
  it("defines the Caseload colors in app/globals.css", async () => {
    const css = await readFile("app/globals.css", "utf8");
    for (const hex of ["#f5f3fc", "#17142b", "#5d5878", "#5b47c9", "#43349a", "#1e1a3a", "#d4cdf0", "#2f7a55"]) {
      expect(css.toLowerCase()).toContain(hex);
    }
  });
});

describe("MCP server", () => {
  it("starts over stdio from any folder and lists its tools", async () => {
    // MCP clients launch the server from wherever they run, not the repo root.
    const root = process.cwd();
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["--no-install", "--prefix", root, "tsx", `${root}/mcp/server.ts`],
      cwd: tmpdir(),
      stderr: "pipe",
    });
    const client = new Client({ name: "smoke-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["answer_setup", "caqh_prep", "check_npi", "draft_gfe", "draft_superbill", "fill_payer_form", "forget", "get_credentialing", "list_payer_applications", "log_event", "morning_brief", "queue_approval", "recheck_rules", "remember", "research_state_rules", "status", "update_credentialing", "update_facts", "update_payer_application"]);

      const result = await client.callTool({ name: "status" });
      const [first] = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(first.text)).toMatchObject({ ok: true });
    } finally {
      await client.close();
    }
  });
});
