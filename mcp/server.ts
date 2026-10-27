import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadEnv } from "../lib/env";

// Load .env from the repo root, wherever the MCP client starts us from.
// MCP client configs never carry secrets.
loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

// Imported after loadEnv so DATABASE_URL is set before the first query.
// Every tool is defined once in lib/aeon/tools.ts, shared with Aeon's chat.
const { TOOLS, runTool } = await import("../lib/aeon/tools");
const { listMemories, memoryMarkdown } = await import("../lib/aeon/memory");

const server = new McpServer({ name: "practice-os", version: "0.1.0" });

/** "mcp:<client>" from the MCP handshake, e.g. mcp:claude-code. */
function createdBy(): string {
  const name = server.server.getClientVersion()?.name ?? "unknown";
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `mcp:${clean || "unknown"}`;
}

for (const tool of TOOLS) {
  server.registerTool(
    tool.name,
    {
      title: tool.title,
      description: tool.description,
      inputSchema: tool.input,
      ...(tool.output ? { outputSchema: tool.output } : {}),
      annotations: tool.annotations,
    },
    (args: unknown) => runTool(tool.name, args, { by: createdBy() }),
  );
}

// AGENTS.md > Aeon's memory: the same memory any agent can read.
server.registerResource(
  "aeon-memory",
  "aeon://memory",
  {
    title: "What Aeon remembers",
    description: "Aeon's saved memories about this practice (preferences, decisions, facts, what worked), as Markdown. Practice business only.",
    mimeType: "text/markdown",
  },
  async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: memoryMarkdown(await listMemories()) }] }),
);

await server.connect(new StdioServerTransport());
