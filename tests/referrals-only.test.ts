import { readdirSync, readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { loadEnv } from "../lib/env";
import * as features from "../lib/features";
import {
  demoApprovalKind,
  demoApprovalShown,
  fileKindEnabled,
  FRONT_DESK_TOOLS,
  hiddenInDemo,
  REFERRAL_DEMO_FILE_KINDS,
  REFERRAL_DEMO_HIDDEN_API,
  REFERRAL_DEMO_HIDDEN_PAGES,
  REFERRAL_DEMO_SCREENS,
  REFERRAL_DEMO_TOOLS,
  REFERRALS_ONLY_DEMO,
  toolEnabled,
} from "../lib/features";

// The referrals-only demo switch (lib/features.ts, hackathon demo 2026-11-04). The "on" block
// holds while the switch is on; the "off" block holds when it is set back to false. The rest of the
// suite branches on the same flag, so a full `npm test` with either value checks that state.
loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { PRACTICE } = await import("../components/sidebar");
const { CONNECTION_CARDS } = await import("../components/connections/registry");
const { chatTools, runTool, TOOLS } = await import("../lib/aeon/tools");
const { soul, REFERRALS_DEMO_SOUL } = await import("../lib/aeon/soul");
const { SUGGESTIONS, REFERRAL_DEMO_SUGGESTIONS } = await import("../lib/aeon/suggestions");
const { EMPLOYER_POLICY_LINE, flatten, QUESTIONS } = await import("../lib/onboarding/chapters");
const { HELPER_QUESTIONS } = await import("../lib/onboarding/helper-questions");
const { proxy } = await import("../proxy");
const { SHOWN_GROUPS, toFileEntry } = await import("../lib/documents/file-entry");
const { SPECIALTIES } = await import("../lib/referrals/nppes");

/** Listed ahead of their PR (lib/features.ts): the debrief tool lands with its own PR. */
const COMING = ["debrief_meeting"];

const ctx = {
  state: "IL",
  credential: "LCPC",
  stage: "beginning",
  seesClients: "both",
  insurance: "self_pay",
  firstRenewal: false,
  medicare: "none",
  medicaid: null,
  officeZip: "60614",
  findClients: [],
  website: null,
  instagram: null,
} as const;
const basics = { state: "IL", credential: "LCPC" as const, practiceStage: "beginning" as const, officeZip: "60614", telehealth: false };
const screens = () => flatten({ ...ctx, findClients: [] }, { helpers: HELPER_QUESTIONS, basics, extra: [{ after: "name", screen: { id: "muse-key", chapter: "you", kind: "slot", ask: "x", aeonSays: "x" } }] });

const HOST = "127.0.0.1:3000";
const page = (pathname: string) => proxy(new NextRequest(`http://${HOST}${pathname}`, { headers: { host: HOST } }));

describe("referrals-only demo: the allow-lists", () => {
  it("names only real tools, pages and kinds", () => {
    const src = readFileSync(new URL("../lib/aeon/tools.ts", import.meta.url), "utf8") + readFileSync(new URL("../lib/aeon/tools-referrals.ts", import.meta.url), "utf8") + readFileSync(new URL("../lib/aeon/tools-files.ts", import.meta.url), "utf8");
    for (const name of REFERRAL_DEMO_TOOLS) if (!COMING.includes(name) || src.includes(`name: "${name}"`)) expect(src, name).toContain(`name: "${name}"`);
    for (const p of REFERRAL_DEMO_HIDDEN_API) expect(readdirSync(new URL(`../app${p}`, import.meta.url)).length, p).toBeGreaterThan(0);
    for (const p of REFERRAL_DEMO_HIDDEN_PAGES) expect(p).toMatch(/^\/[a-z-]+$/);
    expect(REFERRAL_DEMO_FILE_KINDS).toEqual(["uploaded", "referral_letter"]);
    expect(QUESTIONS.some((q) => q.id === "employer_policy")).toBe(true);
  });
});

describe.skipIf(!REFERRALS_ONLY_DEMO)("referrals-only demo is on", () => {
  it("shows only Home chat, Referrals, Approvals, Files, Memory and Settings in the menu", () => {
    expect(PRACTICE.map((l) => l.href)).toEqual(["/referrals", "/approvals", "/files"]);
    // Memory and Settings sit at the bottom of the menu, Home chat is New chat: always there.
    const src = readFileSync(new URL("../components/sidebar.tsx", import.meta.url), "utf8");
    expect(src).toContain('href="/memory"');
    expect(src).toContain('href="/settings"');
  });

  it("sends Admin, Media, Instagram and Grow pages Home, and leaves the rest and every API route alone", () => {
    for (const p of ["/admin", "/admin/deadlines", "/admin/how-do-i", "/media", "/media/instagram", "/media/grow", "/media/website", "/instagram"]) {
      const res = page(p);
      expect(res.status, p).toBe(307);
      expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    }
    for (const p of ["/", "/referrals", "/approvals", "/files", "/memory", "/settings", "/settings/connections", "/onboarding", "/administrator"]) expect(page(p).status, p).toBe(200);
    expect(page("/api/menu").status).toBe(200);
    expect(hiddenInDemo("/api/admin")).toBe(false);
  });

  it("answers 404 on the hidden helpers' API routes, GET and POST, and keeps the rest", () => {
    const api = (method: string, p: string) =>
      proxy(new NextRequest(`http://${HOST}${p}`, { method, headers: { host: HOST, origin: `http://${HOST}`, "sec-fetch-site": "same-origin", "content-type": "application/json" } }));
    for (const p of ["/api/gfe/x", "/api/superbills", "/api/instagram/posts/x/image", "/api/growth/x", "/api/client-forms/x", "/api/studio/x", "/api/payers/x", "/api/credentialing", "/api/media/x", "/api/release-forms/pdf", "/api/obligations/x"]) {
      expect(api("GET", p).status, p).toBe(404);
      expect(api("POST", p).status, p).toBe(404);
    }
    for (const p of ["/api/admin/crisis-seen", "/api/approvals/x/approve", "/api/documents/x", "/api/referrals/find", "/api/chat", "/api/memories", "/api/settings/referrals"]) {
      expect(api("POST", p).status, p).toBe(200);
    }
  });

  it("gives Aeon's chat and MCP only the referral and core tools", () => {
    const names = TOOLS.map((t) => t.name).sort();
    const built = (n: string) => !COMING.includes(n) || names.includes(n);
    expect(names).toEqual(REFERRAL_DEMO_TOOLS.filter((n) => !FRONT_DESK_TOOLS.includes(n) && built(n)).slice().sort());
    for (const hidden of ["morning_brief", "draft_gfe", "caqh_prep", "draft_instagram_post", "set_fees", "build_website"]) expect(toolEnabled(hidden)).toBe(false);
    const chat = chatTools().map((t) => t.function.name);
    expect(chat).toContain("find_referral_sources");
    expect(chat).toContain("remember");
    expect(chat).not.toContain("file_upload"); // MCP only
    // mcp/server.ts registers exactly the shared list.
    expect(readFileSync(new URL("../mcp/server.ts", import.meta.url), "utf8")).toMatch(/for \(const tool of TOOLS\)/);
  });

  it("lets queue_approval take only referral kinds", async () => {
    const queue = TOOLS.find((t) => t.name === "queue_approval")!;
    const kind = queue.input.kind as unknown as { options: string[] };
    expect(kind.options).toEqual(["referral_letter", "file_document"]); // file_upload queues file_document
    const r = await runTool("queue_approval", { kind: "gfe_issue", title: "x" }, { by: "mcp:test" });
    expect(r.isError).toBe(true);
  });

  it("shows only referral approvals: letters, and Aeon actions that wrap a referral tool", () => {
    expect(demoApprovalKind("referral_letter")).toBe(true);
    expect(demoApprovalKind("file_document")).toBe(true); // her uploads are hers
    for (const k of ["gfe_issue", "instagram_post", "state_rules", "test_note", "website"]) expect(demoApprovalKind(k), k).toBe(false);
    expect(demoApprovalShown("aeon_action", "log_referral_contact")).toBe(true);
    expect(demoApprovalShown("aeon_action", "set_fees")).toBe(false);
    expect(demoApprovalShown("aeon_action", undefined)).toBe(false);
  });

  it("keeps only her uploads and referral letters on Files", () => {
    expect(fileKindEnabled("uploaded")).toBe(true);
    expect(fileKindEnabled("referral_letter")).toBe(true);
    for (const k of ["gfe", "superbill", "client_form", "release_form", "instagram_post", "cms855i"]) expect(fileKindEnabled(k), k).toBe(false);
    const letter = toFileEntry({ id: "referral_letter:x", kind: "referral_letter", title: "Letter", status: "Waiting", topics: [] } as never, null);
    expect(letter && fileKindEnabled(letter.card.kind)).toBe(true);
    // Only the chips those kinds fill: no empty Forms, Estimates, Insurance or Media.
    expect(SHOWN_GROUPS).toEqual(["uploaded", "referrals"]);
  });

  it("takes the short onboarding path, ending on the employer reminder", () => {
    const list = screens();
    expect(list.map((s) => s.id)).toEqual([...REFERRAL_DEMO_SCREENS]);
    // The home ZIP is asked even though her office ZIP is known (the office question is skipped).
    expect(list.find((s) => s.id === "referrals:home_zip")?.chapter).toBe("clients");
    expect(list.find((s) => s.id === "referrals:specialties")?.chapter).toBe("clients");
    expect(list.find((s) => s.id === "contact")?.help).toMatch(/letters/);
    const last = list.at(-1)!;
    expect(last).toMatchObject({ id: "employer_policy", kind: "yesno", help: EMPLOYER_POLICY_LINE });
    expect(EMPLOYER_POLICY_LINE).toMatch(/employer/);
    expect(EMPLOYER_POLICY_LINE).toMatch(/conflicts of interest/);
    expect(list[0].aeonSays).toMatch(/referrals partner/);
  });

  it("introduces Aeon as her referrals partner, with the referral tiles and only the Muse card", () => {
    expect(soul()).toContain(REFERRALS_DEMO_SOUL);
    expect(soul()).toMatch(/no clinical or mental health advice/i); // the hard rules stay
    expect(SUGGESTIONS).toEqual(REFERRAL_DEMO_SUGGESTIONS);
    expect(SUGGESTIONS).toEqual(["Who should I reach out to this week?", "Find oncology and palliative care near me", "Debrief my coffee meeting", "Draft a letter to my top 3"]);
    expect(SPECIALTIES.map((s) => s.id)).toContain("oncology"); // the second tile finds a real kind of provider
    const ids = CONNECTION_CARDS.map((c) => c.id);
    expect(ids).toContain("muse");
    expect(ids).not.toContain("google");
    expect(ids).not.toContain("instagram");
  });
});

describe.skipIf(REFERRALS_ONLY_DEMO)("referrals-only demo is off", () => {
  it("restores the full menu, tools, cards, tiles and onboarding", () => {
    expect(PRACTICE.map((l) => l.label)).toContain("Admin");
    expect(PRACTICE.map((l) => l.label)).toContain("Media");
    expect(TOOLS.map((t) => t.name)).toContain("morning_brief");
    expect(CONNECTION_CARDS.map((c) => c.id)).toContain("google");
    expect(SUGGESTIONS).not.toEqual(REFERRAL_DEMO_SUGGESTIONS);
    expect(soul()).not.toContain(REFERRALS_DEMO_SOUL);
    const ids = screens().map((s) => s.id);
    expect(ids).not.toContain("employer_policy");
    expect(ids.length).toBeGreaterThan(20);
    expect(page("/admin").status).toBe(200);
    expect(fileKindEnabled("gfe")).toBe(true);
    expect(demoApprovalShown("aeon_action", "set_fees")).toBe(true);
  });
});

// The modules that read the switch directly, loaded again with it flipped: both states in one run.
describe("the other state of the switch", () => {
  afterAll(() => {
    vi.doUnmock("../lib/features");
    vi.resetModules();
  });

  it("flips the menu, tiles, cards and onboarding path", async () => {
    vi.resetModules();
    const flipped = !REFERRALS_ONLY_DEMO;
    vi.doMock("../lib/features", () => ({ ...features, REFERRALS_ONLY_DEMO: flipped }));
    const { PRACTICE: menu } = await import("../components/sidebar");
    const { SUGGESTIONS: tiles } = await import("../lib/aeon/suggestions");
    const { CONNECTION_CARDS: cards } = await import("../components/connections/registry");
    const { flatten: flat } = await import("../lib/onboarding/chapters");
    const { HELPER_QUESTIONS: helpers } = await import("../lib/onboarding/helper-questions");
    const ids = flat({ ...ctx, findClients: [] }, { helpers, basics }).map((s) => s.id);
    if (flipped) {
      expect(menu.map((l) => l.href)).toEqual(["/referrals", "/approvals", "/files"]);
      expect(tiles).toEqual(REFERRAL_DEMO_SUGGESTIONS);
      expect(cards.map((c) => c.id)).not.toContain("google");
      expect(ids.at(-1)).toBe("employer_policy");
    } else {
      expect(menu.map((l) => l.label)).toEqual(["Admin", "Files", "Approvals", "Referrals", "Media"]);
      expect(tiles).not.toEqual(REFERRAL_DEMO_SUGGESTIONS);
      expect(cards.map((c) => c.id)).toContain("google");
      expect(ids).not.toContain("employer_policy");
      expect(ids).toContain("office");
    }
  });
});

describe.skipIf(!REFERRALS_ONLY_DEMO || !hasDb)("referrals-only demo is on (database)", () => {
  const created: string[] = [];
  afterAll(async () => {
    const { closeDb, db } = await import("../lib/db");
    if (created.length) await db()`delete from practice_os.approvals where id in ${db()(created)}`;
    await closeDb();
  });

  it("lists and counts only referral approvals, and keeps the rest untouched", async () => {
    const { db } = await import("../lib/db");
    const { listApprovals, listApprovalsById } = await import("../lib/approvals");
    const { loadMenuData } = await import("../lib/ui/menu");
    const make = async (kind: string, payload: Record<string, unknown> = {}) => {
      const [row] = await db()`
        insert into practice_os.approvals (kind, title, preview, payload, created_by)
        values (${kind}, 'vitest referrals only', '{}'::jsonb, ${db().json(payload as never)}, 'test')
        returning id`;
      created.push(row.id);
      return row.id as string;
    };
    const letter = await make("referral_letter");
    const logged = await make("aeon_action", { tool: "log_referral_contact", args: {} });
    const gfe = await make("gfe_issue");
    const fees = await make("aeon_action", { tool: "set_fees", args: {} });
    const listed = (await listApprovals({ includeDecided: true, limit: 500 })).map((a) => a.id);
    expect(listed).toEqual(expect.arrayContaining([letter, logged]));
    expect(listed).not.toContain(gfe);
    expect(listed).not.toContain(fees);
    // The menu count is the same filter: every pending approval it counts is one the list shows.
    const pending = (await listApprovals({ includeDecided: true, limit: 500 })).filter((a) => a.status === "pending");
    expect(pending.every((a) => a.kind === "referral_letter" || a.kind === "aeon_action")).toBe(true);
    expect((await loadMenuData()).counts.approvals).toBe(pending.length);
    expect((await listApprovalsById([letter, gfe, fees])).map((a) => a.id)).toEqual([letter]);
    const { approve, decline } = await import("../lib/approvals");
    expect(await approve(gfe, { by: "test" })).toEqual({ ok: false, reason: "not_found" });
    expect(await decline(fees, { by: "test" })).toEqual({ ok: false, reason: "not_found" });
    const [row] = await db()`select status from practice_os.approvals where id = ${gfe}`;
    expect(row.status).toBe("pending"); // hidden, never deleted
    const menu = await loadMenuData();
    expect(menu.counts.admin).toBe(0);
    expect(menu.hidden).toEqual([...REFERRAL_DEMO_HIDDEN_PAGES]);
  });
});
