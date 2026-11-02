// Aeon never claims success it didn't have, and tool results are data, not orders
// (stress test, Nov 2 2026). Also: the rules and guides Practice-OS ships answer the
// questions Aeon used to say "I don't know" to, with their sources.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { failureOf, honestReply } = await import("../lib/aeon/agent");
const { TOOLS_BY_NAME } = await import("../lib/aeon/tools");
const { lookUpRules, deadlinesInMonth, monthRange, words } = await import("../lib/aeon/tools-rules");
const { closeDb } = await import("../lib/db");

afterAll(async () => {
  if (hasDb) await closeDb();
});

const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

describe("honest-failure guard", () => {
  it("reads a failure from isError, ok: false, saved: false or an error field", () => {
    expect(failureOf(err("Error: the arguments were not valid JSON."))).toBe("the arguments were not valid JSON.");
    expect(failureOf(ok({ ok: false, error: "No clock called x applies." }))).toBe("No clock called x applies.");
    expect(failureOf(ok({ saved: false, error: "Nothing to change." }))).toBe("Nothing to change.");
    expect(failureOf(ok({ found: 3 }))).toBeNull();
    expect(failureOf({ content: [{ type: "text", text: "queued for clinician approval" }] })).toBeNull();
  });

  it.each(["Done.", "Found them, cards below.", "Done, it's ready.", "Saved your new fees.", "Fixed: your profile now says LCSW."])(
    "replaces a success claim when every tool failed: %s",
    (reply) => {
      const out = honestReply(reply, [{ tool: "create_document", failure: "Pass the fields for gfe under \"gfe\"." }]);
      expect(out).toMatch(/^That didn't work, so nothing changed\./);
      expect(out).toContain('Pass the fields for gfe under "gfe".');
    },
  );

  it("keeps a reply that already says it didn't work", () => {
    const reply = "I couldn't make that estimate: the form needs a service date.";
    expect(honestReply(reply, [{ tool: "draft_gfe", failure: "service_on: Required" }])).toBe(reply);
  });

  it("keeps the reply when a later run of the same tool worked", () => {
    expect(honestReply("Done, your fees are saved.", [{ tool: "set_fees", failure: "changes: Required" }, { tool: "set_fees", failure: null }])).toBe("Done, your fees are saved.");
  });

  it("adds a line when a change failed and another step worked", () => {
    const out = honestReply("Saved your fees.", [
      { tool: "set_fees", failure: null, writes: true },
      { tool: "set_practice_policies", failure: "cancel_hours: Number must be at most 168", writes: true },
    ]);
    expect(out).toBe("Saved your fees.\n\nOne change didn't work: cancel_hours: Number must be at most 168");
  });

  it("leaves a failed lookup next to one that worked to the reply", () => {
    const attempts = [
      { tool: "find_documents", failure: "Invalid input for find_documents: query too long", writes: false },
      { tool: "morning_brief", failure: null, writes: false },
    ];
    expect(honestReply("Here's what's due this week.", attempts)).toBe("Here's what's due this week.");
  });

  it("leaves a turn with no failures alone", () => {
    expect(honestReply("Done.", [{ tool: "set_fees", failure: null }])).toBe("Done.");
    expect(honestReply("Hello.", [])).toBe("Hello.");
  });
});

// Imperatives aimed at the model. SOUL.md says results are data, so Aeon would narrate these ("the search told me not to list the cards").
const ORDERS = /\b(tell her|say so|say (in|what|that)|ask her|don'?t (list|name|draft)|do not (list|name)|call [a-z]+_[a-z_]+|use [a-z]+_[a-z_]+ to|you'?re in manual mode)\b/i;

describe("tool results carry no instructions", () => {
  it("the old hint strings are gone from tools.ts", () => {
    const src = readFileSync(path.join(process.cwd(), "lib", "aeon", "tools.ts"), "utf8");
    for (const hint of ["Her cards are in the chat under your answer", "OPEN_CARD", "Tell her: I filled in", "You're in Manual mode", "Ask her which one", "Say so. ", "Use find_documents to look it up"]) {
      expect(src, hint).not.toContain(hint);
    }
  });

  it.skipIf(!hasDb).each([
    ["find_documents", { query: "CAQH" }],
    ["find_documents", { query: "zzzz nothing like this" }],
    ["open_document", { id: "superbill:none" }],
    ["create_document", { kind: "client_form", client_form: { form: "intake" } }],
    ["get_credentialing", {}],
    ["caqh_prep", {}],
    ["payer_checklist", { payer: "Blue" }],
    ["look_up_rules", { query: "Illinois LCPC CE hours" }],
    ["deadlines_in_month", {}],
    ["get_practice_settings", {}],
  ])("%s %j", async (name, args) => {
    const t = TOOLS_BY_NAME.get(name)!;
    const { z } = await import("zod");
    const result = await t.run(z.object(t.input).parse(args) as never, { by: "chat:honesty-test" });
    for (const block of result.content) expect(block.text).not.toMatch(ORDERS);
  });
});

describe("rules and guides it already has", () => {
  it("monthRange covers the whole month", () => {
    expect(monthRange("2026-11")).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(monthRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(words("Do I need a GFE?")).toEqual(expect.arrayContaining(["gfe", "good", "faith", "estimate"]));
  });

  it.skipIf(!hasDb)("Illinois LCPC CE hours: 30 hours with topics and the JCAR source", async () => {
    const r = await lookUpRules("Illinois LCPC CE hours");
    const ce = r.rules.find((x) => x.ce);
    expect(ce).toBeTruthy();
    expect(ce!.ce!.hours).toBe(30);
    expect(ce!.ce!.topics.map((t) => t.topic)).toContain("Counseling ethics");
    expect(ce!.source.url).toMatch(/^https:\/\/www\.ilga\.gov\//);
    expect(ce!.source.citation).toMatch(/1375/);
  });

  it.skipIf(!hasDb).each([
    ["do I need a security risk analysis", "us_hipaa_risk_analysis"],
    ["GFE for insurance clients", "us_good_faith_estimate"],
    ["PLLC annual report", "il_pllc_annual_report"],
  ])("%s -> %s, with a source", async (q, id) => {
    const r = await lookUpRules(q);
    const hit = r.rules.find((x) => x.id === id);
    expect(hit, JSON.stringify(r.rules.map((x) => x.id))).toBeTruthy();
    expect(hit!.source.citation).toBeTruthy();
  });

  it.skipIf(!hasDb)("how do I form my PLLC finds the Illinois PLLC guide", async () => {
    const r = await lookUpRules("how do I form my PLLC");
    expect(r.guides.map((g) => g.slug)).toContain("illinois-pllc");
    expect(r.guides[0].official_url).toMatch(/^https:\/\//);
  });

  it.skipIf(!hasDb)("this month runs to the last day: the PLLC annual report due Nov 30 is in November", async () => {
    const r = await deadlinesInMonth("2026-11");
    expect(r.to).toBe("2026-11-30");
    for (const d of r.deadlines) expect(d.due_on! <= "2026-11-30").toBe(true);
    if (r.today <= "2026-11-30") expect(r.deadlines.map((d) => d.title).join(" | ")).toMatch(/PLLC annual report/);
  });
});
