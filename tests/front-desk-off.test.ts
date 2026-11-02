import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "../app/api/website-chat/route";
import { GET as checkGet } from "../app/api/front-desk/check/route";
import { PRACTICE } from "../components/sidebar";
import { CONNECTION_CARDS } from "../components/connections/registry";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { shouldAutoRun } from "../lib/approval-policy";
import { chatTools, TOOLS, TOOLS_BY_NAME, runTool } from "../lib/aeon/tools";
import { FRONT_DESK_APPROVAL_KINDS, FRONT_DESK_ENABLED, FRONT_DESK_TOOLS } from "../lib/features";
import { checkFrontDesk } from "../lib/frontdesk/check";
import { startFrontDeskPoller } from "../lib/frontdesk/poller";
import { flatten, HELPERS, QUESTIONS } from "../lib/onboarding/chapters";
import { HELPER_QUESTIONS } from "../lib/onboarding/helper-questions";
import type { ApprovalKind } from "../lib/approval-kinds";

// Front Desk is paused (lib/features.ts): the clinician sees three helpers and nothing
// of it runs. The code stays, so these hold only while the switch is off.
describe.skipIf(FRONT_DESK_ENABLED)("Front Desk is off", () => {
  it("keeps every Front Desk tool out of the chat and MCP registry", () => {
    const names = TOOLS.map((t) => t.name);
    const chatNames = chatTools().map((t) => t.function.name);
    for (const name of FRONT_DESK_TOOLS) {
      expect(names).not.toContain(name);
      expect(TOOLS_BY_NAME.has(name)).toBe(false);
      expect(chatNames).not.toContain(name);
    }
    expect(names).toContain("morning_brief"); // the rest are untouched
  });

  it("names only real approval kinds", () => {
    for (const k of FRONT_DESK_APPROVAL_KINDS) expect(APPROVAL_KINDS as readonly string[]).toContain(k);
  });

  it("queue_approval refuses a Front Desk kind", async () => {
    const result = await runTool("queue_approval", { kind: "text_consult_options", title: "x" }, { by: "mcp:test", mode: "bypass" });
    expect(result.isError).toBe(true);
  });

  it("never auto-runs a Front Desk kind, whoever asks", () => {
    for (const k of FRONT_DESK_APPROVAL_KINDS) {
      expect(shouldAutoRun(k as ApprovalKind, { mode: "bypass" })).toBe(false);
      expect(shouldAutoRun(k as ApprovalKind, { rule: "front_desk", rules: { text_missed_callers: true, book_by_text: true, send_reminders: true } })).toBe(false);
    }
  });

  it("drops Front Desk from the menu; the phone card stays only as urgent alerts, Cal.com goes", () => {
    expect(PRACTICE.map((l) => l.label)).toEqual(["Admin", "Approvals", "Referrals", "Media"]);
    expect(PRACTICE.some((l) => l.href === "/front-desk")).toBe(false);
    const ids = CONNECTION_CARDS.map((c) => c.id);
    expect(ids).toContain("phone"); // "Urgent alerts to your phone": the crisis text needs a line
    expect(ids).not.toContain("calcom");
    expect(ids).toContain("muse");
  });

  it("leaves out the phone, voicemail and consult-text setup, but keeps her own alert cell", () => {
    expect(HELPERS.map((h) => h.id)).not.toContain("front_desk");
    expect(HELPER_QUESTIONS.map((b) => b.helper)).not.toContain("front_desk");
    expect(QUESTIONS.some((q) => q.id === "alert_phone")).toBe(true);
    const ids = flatten({ stage: "middle", findClients: [], instagram: null, website: null } as never, { helpers: HELPER_QUESTIONS }).map((s) => s.id);
    expect(ids).toContain("alert_phone");
    expect(ids).not.toContain("text_missed_callers");
    expect(ids.some((id) => id.startsWith("front_desk:"))).toBe(false);
  });

  it("answers 404 on the website chat route and the unauthenticated status route", async () => {
    const headers = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
    const get = await GET(new Request("http://localhost:3000/api/website-chat?c=x", { headers }));
    const post = await POST(new Request("http://localhost:3000/api/website-chat", { method: "POST", headers, body: "{}" }));
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
    expect((await checkGet()).status).toBe(404);
  });

  it("does not poll her phone company", async () => {
    const spy = vi.spyOn(globalThis, "setInterval");
    startFrontDeskPoller();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(await checkFrontDesk()).toEqual({ ran: false, reason: "paused" });
  });
});
