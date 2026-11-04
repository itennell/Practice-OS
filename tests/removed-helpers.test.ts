// Media and Front Desk were removed on 2026-11-04. With the referrals-only switch off
// (lib/features.ts) the app is Admin and Referrals: nothing of the removed helpers can
// show up as a page, a nav item, a tool, an onboarding question or an approval kind.
import { existsSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../proxy";
import { PRACTICE } from "../components/sidebar";
import { CONNECTION_CARDS } from "../components/connections/registry";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { KIND_POLICY } from "../lib/approval-policy";
import { TOOLS } from "../lib/aeon/tools";
import { REFERRALS_ONLY_DEMO } from "../lib/features";
import { flatten, HELPERS } from "../lib/onboarding/chapters";
import { HELPER_QUESTIONS } from "../lib/onboarding/helper-questions";

const GONE_PAGES = ["/media", "/media/instagram", "/media/grow", "/media/website", "/instagram", "/grow", "/front-desk", "/website-chat"];
const GONE_KINDS = ["instagram_post", "sms_reply", "consult_booking", "consult_reschedule", "consult_cancel", "web_chat_reply", "text_consult_options", "ads_campaign", "website"];
const GONE_WORDS = /instagram|post_ideas|weekly_plan|draft_post|studio|front_desk|consult|directory|website|google_ads|meta_ads|private_pay/;

const HOST = "127.0.0.1:3000";
const page = (pathname: string) => proxy(new NextRequest(`http://${HOST}${pathname}`, { headers: { host: HOST } }));

describe("Admin and Referrals are the app", () => {
  it("runs with the referrals-only switch off", () => {
    expect(REFERRALS_ONLY_DEMO).toBe(false);
  });

  it("puts Admin and Referrals in the nav, and lets Admin's pages through", () => {
    expect(PRACTICE.map((l) => l.label)).toEqual(["Admin", "Files", "Approvals", "Referrals"]);
    for (const p of ["/admin", "/admin/deadlines", "/admin/how-do-i"]) expect(page(p).status, p).toBe(200);
    for (const p of ["admin/page.tsx", "admin/deadlines", "admin/how-do-i", "referrals/page.tsx"]) expect(existsSync(`app/(app)/${p}`), p).toBe(true);
  });

  it("gives Aeon the Admin tools", () => {
    const names = TOOLS.map((t) => t.name);
    for (const t of ["morning_brief", "draft_gfe", "draft_superbill", "payer_checklist", "find_referral_sources"]) expect(names).toContain(t);
  });
});

describe("nothing of Media or Front Desk is left", () => {
  it("has no page or API route for them, so their paths are 404s", () => {
    for (const p of GONE_PAGES) {
      expect(existsSync(`app/(app)${p}`), p).toBe(false);
      expect(existsSync(`app${p}`), p).toBe(false);
      expect(page(p).status, p).not.toBe(307); // nothing redirects them either; Next answers 404
    }
    for (const p of ["instagram", "media", "studio", "growth", "front-desk", "website-chat", "connect"]) expect(existsSync(`app/api/${p}`), p).toBe(false);
  });

  it("has no nav item, tool, approval kind, connection card or onboarding question of theirs", () => {
    expect(PRACTICE.map((l) => l.href)).not.toEqual(expect.arrayContaining(["/media"]));
    for (const l of PRACTICE) expect(["/media", "/front-desk", "/instagram"]).not.toContain(l.href);
    for (const t of TOOLS) expect(t.name, t.name).not.toMatch(GONE_WORDS);
    for (const k of GONE_KINDS) {
      expect(APPROVAL_KINDS as readonly string[]).not.toContain(k);
      expect(Object.keys(KIND_POLICY)).not.toContain(k);
    }
    expect(CONNECTION_CARDS.map((c) => c.id)).toEqual(["muse"]);
    expect(HELPERS.map((h) => h.id)).toEqual(["admin", "referrals"]);
    expect(HELPER_QUESTIONS.map((b) => b.helper)).toEqual(["referrals"]);
    const ctx = {
      state: "IL", credential: "LCPC", stage: "beginning", seesClients: "both", insurance: "some", firstRenewal: false,
      medicare: "enrolled", medicaid: true, officeZip: "60614", findClients: ["website", "social"], website: "has",
    } as const;
    const screens = flatten({ ...ctx, findClients: [...ctx.findClients] }, { helpers: HELPER_QUESTIONS });
    const words = JSON.stringify(screens);
    expect(words).not.toMatch(/instagram|voicemail|cal\.com|front desk|miss a call|cell phone|website chat|connect your tools/i);
    for (const id of ["alert_phone", "text_missed_callers", "connect", "website", "website_url"]) expect(screens.map((s) => s.id)).not.toContain(id);
  });
});
