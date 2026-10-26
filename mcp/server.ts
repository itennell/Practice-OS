import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { isDryRun, loadEnv } from "../lib/env";

// Load .env from the repo root, wherever the MCP client starts us from.
// MCP client configs never carry secrets.
loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

const server = new McpServer({ name: "practice-os", version: "0.1.0" });

// The helpers' tools get registered here as they are built.
server.registerTool(
  "status",
  {
    title: "Practice-OS status",
    description: "Reports whether Practice-OS is running and whether it is in dry-run mode.",
  },
  async () => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ ok: true, dryRun: isDryRun() }),
      },
    ],
  }),
);

await server.connect(new StdioServerTransport());
