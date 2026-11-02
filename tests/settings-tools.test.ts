// The chat tools that change her real settings (lib/aeon/tools-settings.ts), against
// the built-in test database with Dana's [Sample] demo practice. Each test checks the
// store the app itself reads (a GFE prices from fee_schedule, the PDF route reads the
// '_practice' policies), not just what the tool said. Everything is put back after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const { TOOLS, TOOLS_BY_NAME, runTool } = await import("../lib/aeon/tools");
const { applyDays, applyFees, toPolicies, LICENSE_NAMES } = await import("../lib/aeon/tools-settings");
const { settingFor } = await import("../lib/aeon/setting-text");
const { MemoryRefused, remember } = await import("../lib/aeon/memory");
const { loadPracticeSettings } = await import("../lib/gfe/store");
const { syncCalendar } = await import("../lib/compliance/store");
const { loadCredentialingProfile } = await import("../lib/credentialing/store");

const BY = "chat:settings-test";
/** Runs a tool's own code with parsed input, as runTool does after its checks (the PHI guard needs a model these tests don't download). */
async function run(name: string, args: unknown) {
  const t = TOOLS_BY_NAME.get(name)!;
  const result = await t.run(z.object(t.input).parse(args) as never, { by: BY });
  return { result, body: JSON.parse(result.content[0].text) as Record<string, unknown> };
}

let saved: Record<string, unknown> | null = null;
let startedAt: Date;
const queued: string[] = [];

beforeAll(async () => {
  startedAt = new Date();
  if (!hasDb) return;
  const sql = db();
  const [p] = await sql`select credential, license_line, office_hours, fee_schedule from practice_os.clinician_profile limit 1`;
  const [c] = await sql`select identity, license from practice_os.credentialing_profile where id`;
  const [f] = await sql`select overrides from practice_os.client_form_templates where form_type = '_practice'`;
  saved = { p, c, f: f ?? null };
});

afterAll(async () => {
  if (!hasDb) return;
  const sql = db();
  if (saved) {
    const { p, c, f } = saved as { p: Record<string, unknown>; c: Record<string, unknown>; f: { overrides: unknown } | null };
    await sql`update practice_os.clinician_profile set credential = ${p.credential as string}, license_line = ${p.license_line as string},
      office_hours = ${sql.json(p.office_hours as never)}, fee_schedule = ${sql.json(p.fee_schedule as never)}`;
    await sql`update practice_os.credentialing_profile set identity = ${sql.json(c.identity as never)}, license = ${sql.json(c.license as never)} where id`;
    if (f) await sql`update practice_os.client_form_templates set overrides = ${sql.json(f.overrides as never)} where form_type = '_practice'`;
    else await sql`delete from practice_os.client_form_templates where form_type = '_practice'`;
    await syncCalendar();
  }
  if (queued.length) await sql`delete from practice_os.approvals where id in ${sql(queued)}`;
  await sql`delete from practice_os.memories where created_at >= ${startedAt} and source = ${BY}`;
  await closeDb();
});

const FEES = [
  { code: "90791", label: "First session (intake)", cents: 20000 },
  { code: "90834", label: "Therapy, 38-52 minutes", cents: 15000 },
  { code: "90837", label: "Therapy, 53 minutes or longer", cents: 17500 },
];
const HOURS = { weekdays: [1, 2, 3, 4], closed_on: [], close_federal_holidays: true };

describe("settings tools are registered", () => {
  it("are in the shared tool list, change data and are refused on the view-only copy", async () => {
    for (const name of ["set_fees", "set_office_days", "set_license_type", "set_practice_policies", "undo_last_setting"]) {
      const t = TOOLS.find((x) => x.name === name);
      expect(t, name).toBeTruthy();
      expect(t!.changesData).toBe(true);
      expect(t!.queuesOverMcp).toBe(true);
      const r = await runTool(name, {}, { by: BY, viewOnly: true });
      expect(r.isError).toBe(true);
    }
    expect(TOOLS_BY_NAME.get("get_practice_settings")!.changesData).toBe(false);
  });
});

describe("fees (plain code)", () => {
  it("intake changes 90791", () => {
    const { fees, changed } = applyFees(FEES, [{ service: "intake", dollars: 150 }]);
    expect(fees[0].cents).toBe(15000);
    expect(changed[0]).toMatchObject({ code: "90791", from: "$200.00", to: "$150.00" });
  });

  it("follow_up with more than one session length saved asks which, changing nothing", () => {
    expect(() => applyFees(FEES, [{ service: "follow_up", dollars: 130 }])).toThrow(/Which session length/);
  });

  it("follow_up with all_lengths sets every session length; with one session code, that one", () => {
    const all = applyFees(FEES, [{ service: "follow_up", dollars: 130, all_lengths: true }]);
    expect(all.fees.map((f) => [f.code, f.cents])).toEqual([["90791", 20000], ["90834", 13000], ["90837", 13000]]);
    const one = applyFees([FEES[0], FEES[2]], [{ service: "follow_up", dollars: 130 }]);
    expect(one.changed.map((c) => c.code)).toEqual(["90837"]);
  });

  it("refuses a code Practice-OS doesn't know", () => {
    expect(() => applyFees(FEES, [{ code: "99999", dollars: 90 }])).toThrow(/isn't a CPT code/);
    expect(applyFees([], [{ code: "90832", dollars: 90 }]).fees).toEqual([{ code: "90832", label: "Therapy, 30 minutes", cents: 9000 }]);
  });

  it("refuses $0 unless she says it's free", async () => {
    const t = TOOLS_BY_NAME.get("set_fees")!;
    const schema = z.object(t.input);
    expect(schema.safeParse({ changes: [{ code: "90834", dollars: 0 }] }).success).toBe(false);
    expect(schema.safeParse({ changes: [{ code: "90834", dollars: 0.5 }] }).success).toBe(false);
    expect(schema.safeParse({ changes: [{ code: "90834", dollars: 0, free: true }] }).success).toBe(true);
  });
});

describe("office days and policies (plain code)", () => {
  it("'Saturdays too' adds a day and never replaces the others", () => {
    expect(applyDays(HOURS, { add_weekdays: ["saturday"] }).weekdays).toEqual([1, 2, 3, 4, 6]);
    expect(applyDays(HOURS, { remove_weekdays: ["thursday"] }).weekdays).toEqual([1, 2, 3]);
    expect(applyDays(HOURS, { only_weekdays: ["monday"] }).weekdays).toEqual([1]);
    expect(() => applyDays(HOURS, { remove_weekdays: ["monday", "tuesday", "wednesday", "thursday"] })).toThrow(/no open days/);
  });

  it("turns policy dollars into cents, and 'none' into 0; $0 alone is refused", () => {
    expect(toPolicies({ cancel_hours: 24, late_cancel_fee_dollars: 100, no_show_fee_dollars: "none" })).toEqual({ cancel_hours: 24, late_cancel_fee_cents: 10000, no_show_fee_cents: 0 });
    const schema = z.object(TOOLS_BY_NAME.get("set_practice_policies")!.input);
    expect(schema.safeParse({ late_cancel_fee_dollars: 0 }).success).toBe(false);
  });

  it("keeps the board's license titles", () => {
    expect(LICENSE_NAMES.Psychologist).toBe("Licensed Clinical Psychologist");
  });
});

describe("settings are never memories (plain code)", () => {
  it.each([
    ["Fee for 90837 is $175.", "set_fees"],
    ["My intake fee is 150 and sessions are 130", "set_fees"],
    ["90837 = 175", "set_fees"],
    ["Intake 150, sessions 130", "set_fees"],
    ["Therapy is 130 an hour", "set_fees"],
    ["She is an LCSW, not an LCPC.", "set_license_type"],
    ["Dana is an LCSW", "set_license_type"],
    ["I'm licensed as LCSW since 2019", "set_license_type"],
    ["Sees clients Monday to Thursday.", "set_office_days"],
    ["24 hour cancellation policy with a $100 late cancellation fee", "set_practice_policies"],
  ])("routes to settings: %s", (text, tool) => {
    expect(settingFor(text)?.tool).toBe(tool);
  });

  it.each([
    "Prefers Tuesday consults.",
    "Does not take Medicaid.",
    "Superbill posts got the most saves.",
    "Wants reminders a week before CAQH is due.",
    "Clients prefer consults open on Tuesdays",
    "Clients often forget the cancellation policy",
    "Jordan Lee is an LCSW who refers couples.",
    "Parking validation costs $12 per visit.",
  ])("keeps an ordinary memory: %s", (text) => {
    expect(settingFor(text)).toBeNull();
  });

  it("memory.ts refuses a setting for every writer (remember, reflection, Memory page), before any model check", async () => {
    const err = await remember({ kind: "fact", text: "Fee for 90837 is $175." }, { actor: "aeon", source: BY }).catch((e) => e);
    expect(err).toBeInstanceOf(MemoryRefused);
    expect(err).toMatchObject({ kind: "setting", useTool: "set_fees" });
  });
});

describe.skipIf(!hasDb)("settings tools write the real stores", () => {
  it("set_fees changes the fee list GFEs price from, returns before/after and audits from/to", async () => {
    // Without her words (as over MCP) a session fee names its code.
    const { body } = await run("set_fees", { changes: [{ service: "intake", dollars: 150 }, { code: "90834", dollars: 130 }, { code: "90837", dollars: 130 }] });
    expect(body.saved).toBe(true);
    expect(body.before).toEqual(expect.arrayContaining([{ code: "90791", label: "First session (intake)", fee: "$200.00" }]));
    expect(body.after).toEqual(expect.arrayContaining([{ code: "90791", label: "First session (intake)", fee: "$150.00" }]));
    const { fees } = await loadPracticeSettings();
    expect(Object.fromEntries(fees.map((f) => [f.code, f.cents]))).toMatchObject({ "90791": 15000, "90834": 13000, "90837": 13000 });
    const [a] = await db()`select actor, details from practice_os.audit_log where action = 'office_settings_saved' order by id desc limit 1`;
    expect(a.actor).toBe("aeon");
    expect(a.details.by).toBe(BY);
    expect(a.details.from.fees.find((f: { code: string }) => f.code === "90791").cents).toBe(20000);
    expect(a.details.to.fees.find((f: { code: string }) => f.code === "90791").cents).toBe(15000);
  });

  it("undo_last_setting puts the fees back from the audit", async () => {
    const { body } = await run("undo_last_setting", {});
    expect(body).toMatchObject({ saved: true, undid: "fees and office days" });
    const { fees } = await loadPracticeSettings();
    expect(fees.find((f) => f.code === "90791")?.cents).toBe(20000);
  });

  it("set_fees asks which length rather than overwriting three codes", async () => {
    const { result, body } = await run("set_fees", { changes: [{ service: "follow_up", dollars: 130 }] });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, saved: false });
    expect(body.ask_which).toHaveLength(2);
    const { fees } = await loadPracticeSettings();
    expect(fees.find((f) => f.code === "90837")?.cents).toBe(17500);
  });

  it("set_office_days adds Saturday without dropping the others", async () => {
    const { body } = await run("set_office_days", { add_weekdays: ["saturday"], add_closed_on: ["2026-12-24"] });
    expect(body).toMatchObject({ saved: true, before: { open_days: ["Monday", "Tuesday", "Wednesday", "Thursday"] }, after: { open_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"] } });
    const { hours } = await loadPracticeSettings();
    expect(hours.weekdays).toEqual([1, 2, 3, 4, 6]);
    expect(hours.closed_on).toContain("2026-12-24");
  });

  it("set_license_type changes profile, credentialing, audit and calendar together", async () => {
    const { body } = await run("set_license_type", { license_type: "LCSW" });
    expect(body.error).toBeUndefined();
    expect(body).toMatchObject({
      saved: true,
      before: { license_type: "LCPC" },
      after: { license_type: "LCSW", license_line: "Dana Reyes, LCSW (fictional demo practice)" },
      needs_facts: expect.any(Array),
    });
    const [p] = await db()`select credential from practice_os.clinician_profile limit 1`;
    expect(p.credential).toBe("LCSW");
    const cred = await loadCredentialingProfile();
    expect(cred?.identity.credential).toBe("LCSW");
    expect(cred?.identity.practiceName).toBe("Reyes Counseling PLLC");
    expect(cred?.license.type).toBe("Licensed Clinical Social Worker (LCSW)");
    const rules = await db()<{ rule_id: string }[]>`select rule_id from practice_os.obligations where rule_id like 'il_%_renewal'`;
    expect(rules.map((r) => r.rule_id)).toContain("il_lcsw_renewal");
    expect(rules.map((r) => r.rule_id)).not.toContain("il_lcpc_renewal");
    const [a] = await db()`select actor, details from practice_os.audit_log where action = 'license_type_changed' order by id desc limit 1`;
    expect(a).toMatchObject({ actor: "aeon", details: { by: BY, from: "LCPC", to: "LCSW" } });
  });

  it("set_license_type refuses, changing nothing, when the board is unknown", async () => {
    const [before] = await db()`select license from practice_os.credentialing_profile where id`;
    await db()`update practice_os.clinician_profile set state = 'WI'`;
    await db()`update practice_os.credentialing_profile set license = ${db().json({ type: "x", state: "WI", board: "" } as never)} where id`;
    try {
      const { result, body } = await run("set_license_type", { license_type: "LMFT" });
      expect(result.isError).toBe(true);
      expect(body).toMatchObject({ ok: false, saved: false });
      const [p] = await db()`select credential from practice_os.clinician_profile limit 1`;
      expect(p.credential).toBe("LCSW");
    } finally {
      await db()`update practice_os.clinician_profile set state = 'IL'`;
      await db()`update practice_os.credentialing_profile set license = ${db().json(before.license as never)} where id`;
    }
  });

  it("set_practice_policies saves what the client-form PDFs read, with before/after and an audit from/to", async () => {
    const { body } = await run("set_practice_policies", { cancel_hours: 24, late_cancel_fee_dollars: 100 });
    expect(body).toMatchObject({ saved: true, changed: ["cancel_hours", "late_cancel_fee_cents"], after: { cancel_hours: 24, late_cancel_fee_cents: 10000 } });
    const [row] = await db()`select overrides from practice_os.client_form_templates where form_type = '_practice'`;
    expect(row.overrides).toMatchObject({ cancel_hours: 24, late_cancel_fee_cents: 10000 });
    for (const f of (body.forms as { not_ready: { why: string }[] }).not_ready) expect(f.why).not.toMatch(/practice policies/i);
    const [a] = await db()`select details from practice_os.audit_log where action = 'client_form_policies_saved' order by id desc limit 1`;
    expect(a.details.to.policies).toMatchObject({ cancel_hours: 24 });
    expect(a.details.from).toHaveProperty("saved");
  });

  it("get_practice_settings reads back what was saved", async () => {
    const { body } = await run("get_practice_settings", {});
    expect(body).toMatchObject({ license_type: "LCSW", policies_saved: true, open_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Saturday"] });
  });

  it("over MCP a settings change waits in her Approvals instead of running", async () => {
    const r = await runTool("set_fees", { changes: [{ code: "90834", dollars: 99 }] }, { by: "mcp:vitest" });
    const body = JSON.parse(r.content[0].text);
    expect(body).toMatchObject({ waiting_for_her: true, where: "her Approvals" });
    queued.push(body.approval_id);
    const { fees } = await loadPracticeSettings();
    expect(fees.find((f) => f.code === "90834")?.cents).not.toBe(9900);
    const [ap] = await db()`select kind, status from practice_os.approvals where id = ${body.approval_id}`;
    expect(ap).toMatchObject({ kind: "aeon_action", status: "pending" });
  });

  it("remember refuses a fee and names the settings tool, saving nothing", async () => {
    const { result, body } = await run("remember", { kind: "fact", text: "Fee for 90837 is $175." });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, saved: false, use_tool: "set_fees" });
    const rows = await db()`select id from practice_os.memories where created_at >= ${startedAt} and source = ${BY}`;
    expect(rows).toHaveLength(0);
  });
});
