import { readFile } from "node:fs/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("design tokens", () => {
  it("defines the calm neutral palette and the purple accent in app/globals.css", async () => {
    const css = await readFile("app/globals.css", "utf8");
    for (const hex of ["#faf9f5", "#ffffff", "#1f1e1d", "#262624", "#30302e", "#f5f4ef", "#5b47c9", "#8e7cf8", "#2f7a55"]) {
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
      // The test run's database (tests/setup/database.ts); without it the server would start the built-in one in .data.
      env: { ...getDefaultEnvironment(), DATABASE_URL: process.env.DATABASE_URL ?? "" },
    });
    const client = new Client({ name: "smoke-test", version: "0.0.0" });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name).sort()).toEqual(["answer_setup", "caqh_prep", "check_npi", "create_document", "directory_profile", "draft_gfe", "draft_instagram_post", "draft_outreach", "draft_post", "draft_superbill", "file_upload", "fill_payer_form", "find_documents", "find_referral_sources", "forget", "front_desk_check_now", "front_desk_status", "get_credentialing", "instagram_account_steps", "list_instagram_posts", "list_payer_applications", "list_referral_sources", "log_event", "log_referral_contact", "make_release_form", "morning_brief", "move_referral_source", "offer_consult_times", "open_document", "other_directories", "plan_instagram_week", "post_ideas", "pt_profile_interview", "queue_approval", "recent_memory_changes", "recheck_referral_source", "recheck_rules", "referral_outreach_plan", "remember", "research_post_topic", "research_state_rules", "set_referral_email", "status", "update_credentialing", "update_facts", "update_payer_application", "website_help", "weekly_plan"]);

      const result = await client.callTool({ name: "status" });
      const [first] = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(first.text)).toMatchObject({ ok: true });
    } finally {
      await client.close();
    }
  });
});
