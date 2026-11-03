// Ask Aeon in each approval mode (Manual, Auto, Bypass), against the built-in throwaway
// database only: plan_referral_meeting and draft_outreach say what really happened (booked
// or approved under her mode vs waiting for her OK), the generic outcome block on every
// queue-then-maybe-run tool, the built-in call script with her real phone, and the weekly
// plan in the Partners table's order. Fake data only; dates far ahead (2030).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (t: string) => ({ ok: true, text: t })) }));

import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";
import type { ApprovalMode } from "../lib/approval-modes";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { runTool } = await import("../lib/aeon/tools");
const { outcomeOf, ranOf } = await import("../lib/aeon/agent");
const { outreachPlan, rankCards, tiersWithLog } = await import("../lib/referrals/plan");
const { contactsFor, isSuppressed, suppressedList } = await import("../lib/referrals/contacts");
const { listSources, practiceFacts, tierContext } = await import("../lib/referrals/store");
const { scriptFacts } = await import("../lib/referrals/crm");

const CHI = "America/Chicago";
const made: string[] = [];
const approvals: string[] = [];
let saved: { timezone: string; office_hours: unknown } | null = null;
const BY = "chat:modes-test";

async function makeCard(name: string, over: { specialty?: string; taxonomy?: string; stage?: string } = {}) {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (name, organization, specialty, taxonomy, npi_type, address, city, state, zip, stage, distance_miles, phone, is_sample)
    values (${name}, ${name}, ${over.specialty ?? "Oncology"}, ${over.taxonomy ?? null}, 'organization', '100 W Modes St', 'Chicago', 'IL', '60614',
            ${over.stage ?? "found"}, 0.4, '312-555-0199', true)
    returning id`;
  made.push(row.id);
  return row.id;
}

const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text) as Record<string, unknown>;

describe.skipIf(!local)("Ask Aeon in every approval mode (built-in database only)", () => {
  beforeAll(async () => {
    const [s] = await db()<{ timezone: string }[]>`select timezone from practice_os.settings limit 1`;
    const [p] = await db()<{ office_hours: unknown }[]>`select office_hours from practice_os.clinician_profile limit 1`;
    saved = { timezone: s?.timezone ?? CHI, office_hours: p?.office_hours ?? null };
    await db()`update practice_os.settings set timezone = ${CHI}`;
    await db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [1, 2, 3, 4, 5], closed_on: [], close_federal_holidays: true } as never)}`;
    await db()`delete from practice_os.referral_meetings where starts_at >= '2030-05-01' and starts_at < '2030-07-01'`;
  });

  afterAll(async () => {
    if (saved) {
      await db()`update practice_os.settings set timezone = ${saved.timezone}`;
      if (saved.office_hours) await db()`update practice_os.clinician_profile set office_hours = ${db().json(saved.office_hours as never)}`;
    }
    if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    await closeDb();
  });

  const WEEKS: Record<ApprovalMode, [string, string]> = { manual: ["2030-05-06", "2030-05-10"], auto: ["2030-05-13", "2030-05-17"], bypass: ["2030-05-20", "2030-05-24"] };

  it.each(["manual", "auto"] as const)("plan_referral_meeting in %s: waiting for her OK, nothing on the calendar", async (mode) => {
    const card = await makeCard(`[Sample] Modestest ${mode} Oncology`);
    const [from, to] = WEEKS[mode];
    const r = await runTool("plan_referral_meeting", { partner: card, kind: "coffee", from, to }, { by: BY, mode });
    const out = json(r);
    approvals.push(out.approval_id as string);
    expect(out).toMatchObject({ queued: true, booked: false, waiting_for_her: true, where: "her Approvals" });
    expect(outcomeOf(r)).toEqual({ state: "waiting", where: "her Approvals" });
    expect(ranOf(r)).toBeNull();
    const [row] = await db()<{ status: string }[]>`select status from practice_os.approvals where id = ${out.approval_id as string}`;
    expect(row.status).toBe("pending");
    expect((await db()`select id from practice_os.referral_meetings where source_id = ${card}`).length).toBe(0);
  });

  it("plan_referral_meeting in bypass: booked, with the time; the reply can't say it waits", async () => {
    const card = await makeCard("[Sample] Modestest bypass Oncology");
    const [from, to] = WEEKS.bypass;
    const r = await runTool("plan_referral_meeting", { partner: card, kind: "coffee", from, to }, { by: BY, mode: "bypass" });
    const out = json(r);
    approvals.push(out.approval_id as string);
    expect(out).toMatchObject({ booked: true, on_her_calendar: true, waiting_for_her: false, ran_on_its_own: true });
    expect(out.say).toMatch(/on your Referrals calendar for Mon May 20, 9:00 am/);
    expect(outcomeOf(r).state).toBe("ok");
    expect(ranOf(r)).toMatch(/on your Referrals calendar/);
    // The generic block is there too, for any client that reads only the last text.
    expect(r.content.some((b) => b.text.includes("approval_outcomes"))).toBe(true);
    const rows = await db()<{ starts_at: Date }[]>`select starts_at from practice_os.referral_meetings where source_id = ${card}`;
    expect(rows).toHaveLength(1);
    expect(new Date(rows[0].starts_at).toISOString()).toBe("2030-05-20T14:00:00.000Z");
  });

  const LETTER =
    "Dear Doctor,\n\nI'm Dana Reyes, LCPC, in Lincoln Park. I see adults and families. Would you be open to a 15-minute call to talk about how we might work together?\n\nDana Reyes, LCPC";
  const chat = (async () => ({ choices: [{ message: { content: JSON.stringify({ subject: "Introduction", letter: LETTER }) } }] })) as never;

  it.each([
    ["manual", "waiting for her approval", "pending"],
    ["auto", "waiting for her approval", "pending"],
    ["bypass", "approved under her mode: ready to copy, not sent", "done"],
  ] as const)("draft_outreach in %s says %s", async (mode, status, row) => {
    const card = await makeCard(`[Sample] Modestest letter ${mode} Oncology`);
    const r = await runTool("draft_outreach", { id: card }, { by: BY, mode, chat });
    expect(r.structuredContent).toMatchObject({ status: row });
    approvals.push(r.structuredContent!.approval_id as string);
    const out = JSON.parse(r.content[1].text) as Record<string, unknown>;
    expect(out.status).toBe(status);
    if (mode === "bypass") {
      expect(r.content[0].text).toMatch(/NOT waiting for her approval/);
      expect(r.content.some((b) => b.text.includes("approval_outcomes"))).toBe(true);
    } else {
      expect(r.content[0].text).toMatch(/queued for clinician approval/);
      expect(r.content.some((b) => b.text.includes("approval_outcomes"))).toBe(false);
    }
  });

  it("queue_approval in bypass reports done, and the generic block says it isn't waiting", async () => {
    const card = await makeCard("[Sample] Modestest queue Oncology");
    const r = await runTool("queue_approval", { kind: "referral_letter", title: "Intro", payload: { referral_source_id: card, subject: "Introduction", letter: LETTER } }, { by: BY, mode: "bypass" });
    approvals.push(r.structuredContent!.approval_id as string);
    expect(r.structuredContent).toMatchObject({ status: "done" });
    const block = JSON.parse(r.content.at(-1)!.text) as { approval_outcomes: { status: string; ran_on_its_own: boolean }[]; about: string };
    expect(block.approval_outcomes[0]).toMatchObject({ status: "done", ran_on_its_own: true });
    expect(block.about).toMatch(/NOT waiting/);
  });

  it("referral_call_script is the built-in script, with her real phone and no blanks", async () => {
    const card = await makeCard("[Sample] Modestest Womens Cancer Care Associates");
    const out = json(await runTool("referral_call_script", { partner: card }, { by: BY }));
    expect(out.written).toBe(true);
    const scripts = out.scripts as { variant: string; sections: { title: string; lines: string[] }[] }[];
    expect(scripts.map((s) => s.variant)).toEqual(["Front desk", "Provider", "Voicemail"]);
    const all = scripts.flatMap((s) => s.sections.flatMap((x) => x.lines)).join("\n");
    expect(all).not.toMatch(/\[say your number\]|\[.*number.*\]/i);
    // The demo practice's phone is on file (312-555-0142): the script says it.
    const facts = await scriptFacts();
    expect(facts.phone).toBeTruthy();
    expect(out.phone_on_file).toBe(true);
    expect(all).toContain(facts.phone!);
    const one = json(await runTool("referral_call_script", { partner: card, variant: "voicemail" }, { by: BY }));
    expect((one.scripts as unknown[]).length).toBe(1);
  });

  it("the weekly plan uses the Partners table's order and says why a higher card isn't new", async () => {
    const [cards, facts] = await Promise.all([listSources(), practiceFacts()]);
    const contacts = await contactsFor(cards.map((c) => c.id));
    const tiers = tiersWithLog(cards, contacts, tierContext(facts));
    const plan = await outreachPlan(undefined, 3);
    const blocked = await suppressedList();
    const table = rankCards(cards.filter((c) => c.stage !== "not_a_fit" && !isSuppressed(c, blocked)), tiers);
    // Each pick carries its place in that order, ranks rise, and every card above the last pick is explained.
    for (const item of plan.reach_out) expect(item.board_rank).toBe(table.findIndex((c) => c.id === item.id) + 1);
    expect([...plan.reach_out.map((r) => r.board_rank)]).toEqual([...plan.reach_out.map((r) => r.board_rank)].sort((a, b) => a - b));
    const last = Math.max(0, ...plan.reach_out.map((r) => r.board_rank));
    const picked = new Set(plan.reach_out.map((r) => r.id));
    const above = table.slice(0, last).filter((c) => !picked.has(c.id)).length;
    expect(plan.skipped_above.length).toBe(Math.min(5, above));
    expect(plan.partners_top.map((p) => p.id)).toEqual(table.slice(0, 3).map((c) => c.id));
    for (const item of plan.reach_out) expect(item.fits_focus).toBe(tiers[item.id].reasons.some((r) => r.startsWith("Fits your ")));
  });
});
