import { describe, expect, it } from "vitest";
import { GET, POST } from "../app/api/website-chat/route";
import { PRACTICE } from "../components/sidebar";
import { CONNECTION_CARDS } from "../components/connections/registry";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { chatTools, TOOLS, TOOLS_BY_NAME } from "../lib/aeon/tools";
import { FRONT_DESK_APPROVAL_KINDS, FRONT_DESK_ENABLED, FRONT_DESK_TOOLS } from "../lib/features";
import { flatten, HELPERS, QUESTIONS } from "../lib/onboarding/chapters";
import { HELPER_QUESTIONS } from "../lib/onboarding/helper-questions";

// Front Desk is paused (lib/features.ts): the clinician sees three helpers.
// The code stays, so these only hold while the switch is off.
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

  it("drops Front Desk from the menu and the Connections cards", () => {
    expect(PRACTICE.map((l) => l.label)).toEqual(["Admin", "Approvals", "Referrals", "Media"]);
    expect(PRACTICE.some((l) => l.href === "/front-desk")).toBe(false);
    const ids = CONNECTION_CARDS.map((c) => c.id);
    expect(ids).not.toContain("phone");
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

  it("answers 404 on the website chat route", async () => {
    const headers = { "sec-fetch-site": "same-origin", "content-type": "application/json" };
    const get = await GET(new Request("http://localhost:3000/api/website-chat?c=x", { headers }));
    const post = await POST(new Request("http://localhost:3000/api/website-chat", { method: "POST", headers, body: "{}" }));
    expect(get.status).toBe(404);
    expect(post.status).toBe(404);
  });
});
