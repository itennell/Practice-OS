import { readFile } from "node:fs/promises";
import { FRONT_DESK_ENABLED, REFERRAL_DEMO_TOOLS, REFERRALS_ONLY_DEMO } from "../lib/features";
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
      const expected = ["answer_setup", "build_website", "caqh_prep", "check_npi", "check_payer_step", "create_document", "deadlines_in_month", "debrief_meeting", "directory_profile", "draft_gfe", "draft_google_ads", "draft_instagram_post", "draft_meta_ads", "draft_outreach", "draft_post", "draft_superbill", "file_upload", "fill_payer_form", "find_documents", "find_referral_cards", "find_referral_sources", "forget", "front_desk_check_now", "front_desk_status", "get_credentialing", "get_practice_settings", "instagram_account_steps", "list_instagram_posts", "list_payer_applications", "list_referral_sources", "log_event", "log_referral_contact", "log_referral_out", "look_up_rules", "make_release_form", "make_studio_post", "morning_brief", "move_referral_source", "offer_consult_times", "open_document", "other_directories", "payer_checklist", "plan_instagram_week", "post_ideas", "private_pay_plan", "pt_profile_interview", "queue_approval", "read_document", "recent_memory_changes", "recheck_referral_source", "recheck_rules", "referral_outreach_plan", "remember", "research_post_topic", "research_state_rules", "revise_instagram_post", "revise_referral_letter", "set_do_not_contact", "set_fees", "set_license_type", "set_office_days", "set_practice_policies", "set_referral_email", "set_referral_niche", "status", "undo_last_setting", "update_credentialing", "update_facts", "update_payer_application", "website_help", "weekly_plan"];
      const paused = ["front_desk_check_now", "front_desk_status", "offer_consult_times"]; // lib/features.ts
      const shown = FRONT_DESK_ENABLED ? expected : expected.filter((n) => !paused.includes(n));
      // The referrals-only demo lists only its allow-list (lib/features.ts).
      expect(tools.map((t) => t.name).sort()).toEqual(REFERRALS_ONLY_DEMO ? shown.filter((n) => REFERRAL_DEMO_TOOLS.includes(n)) : shown);

      const result = await client.callTool({ name: "status" });
      const [first] = result.content as Array<{ type: string; text: string }>;
      expect(JSON.parse(first.text)).toMatchObject({ ok: true });
    } finally {
      await client.close();
    }
  });
});
