import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
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
  it("starts over stdio and lists its tools", async () => {
    const transport = new StdioClientTransport({
      command: "npx",
      args: ["tsx", "mcp/server.ts"],
      stderr: "pipe",
    });
    const client = new Client({ name: "smoke-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["queue_approval", "status"]);

      const result = await client.callTool({ name: "status" });
      const [first] = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(first.text)).toMatchObject({ ok: true });
    } finally {
      await client.close();
    }
  });
});
