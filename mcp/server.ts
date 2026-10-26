import path from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { isDryRun, loadEnv } from "../lib/env";

// Load .env from the repo root, wherever the MCP client starts us from.
// MCP client configs never carry secrets.
loadEnv(path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."));

// Imported after loadEnv so DATABASE_URL is set before the first query.
const { queueApproval } = await import("../lib/approvals");

const server = new McpServer({ name: "practice-os", version: "0.1.0" });

server.registerTool(
  "status",
  {
    title: "Practice-OS status",
    description: "Reports whether Practice-OS is running and whether it is in dry-run mode.",
    annotations: { readOnlyHint: true, openWorldHint: false },
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

const MAX_JSON_BYTES = 20_000;
const jsonObject = z
  .record(z.unknown())
  .refine((v) => Buffer.byteLength(JSON.stringify(v)) <= MAX_JSON_BYTES, {
    message: `Must be at most ${MAX_JSON_BYTES / 1000} KB as JSON.`,
  });

/** "mcp:<client>" from the MCP handshake, e.g. mcp:claude-code. */
function createdBy(): string {
  const name = server.server.getClientVersion()?.name ?? "unknown";
  const clean = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `mcp:${clean || "unknown"}`;
}

// AGENTS.md > Approvals: agents and tools only INSERT pending approvals.
// Nothing is sent, posted or booked until the clinician approves in the app.
server.registerTool(
  "queue_approval",
  {
    title: "Queue for clinician approval",
    description:
      "Adds a draft action (a letter, post, text reply or booking) to the clinician's approvals inbox as pending. " +
      "Nothing is sent, posted or booked until she approves it in Practice-OS.",
    inputSchema: {
      kind: z.enum(APPROVAL_KINDS).describe("What kind of action this is."),
      title: z.string().trim().min(1).max(200).describe("A short line the clinician sees in her inbox."),
      preview: jsonObject.optional().describe("What the clinician sees before approving, e.g. { body: '...' }."),
      payload: jsonObject.optional().describe("What the executor needs to carry it out after approval."),
    },
    outputSchema: { status: z.literal("pending"), approval_id: z.string().uuid() },
    annotations: { destructiveHint: false, openWorldHint: false, idempotentHint: false },
  },
  async ({ kind, title, preview, payload }) => {
    const id = await queueApproval({ kind, title, preview, payload, createdBy: createdBy() });
    return {
      // Second text block too: some clients (Muse) read only text, not structuredContent.
      content: [
        { type: "text", text: "queued for clinician approval" },
        { type: "text", text: `approval_id: ${id}` },
      ],
      structuredContent: { status: "pending" as const, approval_id: id },
    };
  },
);

await server.connect(new StdioServerTransport());
