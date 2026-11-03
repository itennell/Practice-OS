// Aeon never claims success it didn't have, and tool results are data, not orders
// (stress test, Nov 2 2026). Also: the rules and guides Practice-OS ships answer the
// questions Aeon used to say "I don't know" to, with their sources.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { toolEnabled } from "../lib/features";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { failureOf, honestReply, outcomeOf } = await import("../lib/aeon/agent");
const { TOOLS_BY_NAME } = await import("../lib/aeon/tools");
const { lookUpRules, deadlinesInMonth, monthRange, words, ruleView, NO_SOURCE } = await import("../lib/aeon/tools-rules");
const { SHIPPED_RULES } = await import("../lib/compliance/rules");
const { closeDb } = await import("../lib/db");

afterAll(async () => {
  if (hasDb) await closeDb();
});

const err = (text: string) => ({ content: [{ type: "text" as const, text }], isError: true });
const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });

describe("honest-failure guard", () => {
  it("one failure convention for every tool", () => {
    expect(failureOf(err("Error: the arguments were not valid JSON."))).toBe("the arguments were not valid JSON.");
    expect(failureOf(ok({ ok: false, error: "No clock called x applies." }))).toBe("No clock called x applies.");
    expect(failureOf(ok({ saved: false, error: "Nothing to change." }))).toBe("Nothing to change.");
    for (const v of [{ written: false }, { not_changed: true }, { not_checked: "s1" }, { moved: false }, { forgotten: false, id: "x" }, { prep: null }]) {
      expect(failureOf(ok(v)), JSON.stringify(v)).not.toBeNull();
    }
    expect(failureOf(ok({ saved: false, already_remembered: true, id: "x" }))).toBeNull();
    expect(failureOf(ok({ found: 3 }))).toBeNull();
    expect(failureOf({ content: [{ type: "text", text: "queued for clinician approval" }] })).toBeNull();
    expect(outcomeOf(ok({ waiting_for_her: true, approval_id: "a", where: "the bar above the chat box" }))).toEqual({ state: "waiting", where: "the bar above the chat box" });
  });

  const failedWrite = [{ tool: "set_fees", failure: "Which session length is this fee for? Nothing was changed.", writes: true }];
  it.each(["Done.", "I've set your fees.", "I've added Saturday.", "Your fees are now $150 and $130.", "Sorted.", "Booked it.", "All good, here it is."])(
    "replaces any reply that doesn't own it when every change failed: %s",
    (reply) => {
      const out = honestReply(reply, failedWrite);
      expect(out).toBe("That didn't work, so nothing changed. Which session length is this fee for? Nothing was changed.");
    },
  );

  it("keeps a reply that already says it didn't work", () => {
    const reply = "I couldn't change your fees: which session length is $130 for?";
    expect(honestReply(reply, failedWrite)).toBe(reply);
  });

  it("leaves the answer alone when only lookups failed", () => {
    const attempts = [
      { tool: "payer_checklist", failure: 'No payer called "Blu" fits a LCPC in IL.', writes: false },
      { tool: "payer_checklist", failure: null, writes: false },
    ];
    expect(honestReply("Found it: Blue Cross is next.", attempts)).toBe("Found it: Blue Cross is next.");
    expect(honestReply("Found it.", [{ tool: "payer_checklist", failure: "No payer called X", writes: false }])).toBe("Found it.");
  });

  it("keeps the reply when a later run of the same tool worked", () => {
    expect(honestReply("Done, your fees are saved.", [{ tool: "set_fees", failure: "changes: Required", writes: true }, { tool: "set_fees", failure: null, writes: true }])).toBe(
      "Done, your fees are saved.",
    );
  });

  it("adds a line when a change failed and another worked, unless the reply owns it", () => {
    const attempts = [
      { tool: "set_fees", failure: null, writes: true },
      { tool: "set_practice_policies", failure: "cancel_hours: Number must be at most 168", writes: true },
    ];
    expect(honestReply("Saved your fees and policies.", attempts)).toBe("Saved your fees and policies.\n\nOne change didn't work: cancel_hours: Number must be at most 168");
    const owned = "Saved your fees. Your policies didn't save: the notice can be at most 168 hours.";
    expect(honestReply(owned, attempts)).toBe(owned);
  });

  it("a change waiting for her OK is never called saved", () => {
    const waiting = [{ tool: "set_fees", failure: null, writes: true, waiting: "the bar above the chat box" }];
    expect(honestReply("Saved your new fees.", waiting)).toBe("That's waiting for your OK in the bar above the chat box; nothing has changed yet.");
    const said = "Your fee change is waiting for your OK in the bar above the chat box.";
    expect(honestReply(said, waiting)).toBe(said);
  });

  it("says so when the reply points to cards and none came back", () => {
    expect(honestReply("Here they are, cards below.", [{ tool: "find_documents", failure: null, writes: false, cards: 0 }])).toMatch(/No cards came back this time\.$/);
    expect(honestReply("Here they are, cards below.", [{ tool: "find_documents", failure: null, writes: false, cards: 2 }])).toBe("Here they are, cards below.");
  });

  it("leaves a turn with no failures alone", () => {
    expect(honestReply("Done.", [{ tool: "set_fees", failure: null, writes: true }])).toBe("Done.");
    expect(honestReply("Hello.", [])).toBe("Hello.");
  });
});

// Imperatives aimed at the model. SOUL.md says results are data, so Aeon would narrate these ("the search told me not to list the cards").
const ORDERS = /\b(tell her|say so|say (in|what|that)|ask her|don'?t (list|name|draft)|do not (list|name)|call [a-z]+_[a-z_]+|use [a-z]+_[a-z_]+ to|you'?re in manual mode)\b/i;

describe("tool results carry no instructions", () => {
  it("the old hint strings are gone from tools.ts", () => {
    const src = readFileSync(path.join(process.cwd(), "lib", "aeon", "tools.ts"), "utf8");
    for (const hint of ["Her cards are in the chat under your answer", "OPEN_CARD", "Tell her: I filled in", "You're in Manual mode", "Ask her which one", "Say so. ", "Use find_documents to look it up",
      'next: "Call directory_profile', 'next: "Show the search card', "ask them, then call again", "rules: \"Her own words", 'next: "It\'s waiting in Approvals', 'next: "The words and the practice']) {
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
  ].filter(([name]) => toolEnabled(name as string)) as [string, Record<string, unknown>][])("%s %j", async (name, args) => {
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

describe("rule sources and labels", () => {
  it("a rule with no official page says so instead of a null link, and every rule has its checked date", () => {
    const noUrl = SHIPPED_RULES.filter((r) => !r.source.url);
    expect(noUrl.length).toBeGreaterThan(0);
    for (const r of noUrl) expect(ruleView(r, null, null).source.url).toBe(NO_SOURCE);
    for (const r of SHIPPED_RULES) expect(ruleView(r, null, null).source.checked_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("an unconfirmed researched rule is labeled 'Aeon researched, please confirm'", () => {
    expect(ruleView({ ...SHIPPED_RULES[0], verified_by: "agent" }, null, null)).toMatchObject({ verified: false, label: "Aeon researched, please confirm" });
    expect(ruleView({ ...SHIPPED_RULES[0], verified_by: "clinician" }, null, null)).not.toHaveProperty("label");
  });

  it.skipIf(!hasDb)("a past month lists what was due then, done ones included", async () => {
    const { db } = await import("../lib/db");
    const [row] = await db()<{ id: string }[]>`
      insert into practice_os.obligations (kind, title, category, due_on, jurisdiction, verified_by, status, is_sample)
      values ('deadline', '[Sample] Past test deadline', 'other', '2026-09-15', 'US', 'maintainer', 'done', true) returning id`;
    try {
      const r = await deadlinesInMonth("2026-09");
      expect(r.from).toBe("2026-09-01");
      const hit = r.deadlines.find((d) => d.title === "[Sample] Past test deadline");
      expect(hit).toMatchObject({ due_on: "2026-09-15", done: true, source: { url: NO_SOURCE } });
    } finally {
      await db()`delete from practice_os.obligations where id = ${row.id}`;
    }
  });
});
