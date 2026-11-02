// The chat tools that change her real settings (lib/aeon/tools-settings.ts), against
// the built-in test database with Dana's [Sample] demo practice. Each test checks the
// store the app itself reads (a GFE prices from fee_schedule, the PDF route reads the
// '_practice' policies), not just what the tool said. Everything is put back after.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

const { closeDb, db } = await import("../lib/db");
const { TOOLS, TOOLS_BY_NAME, runTool } = await import("../lib/aeon/tools");
const { applyFees, settingFor, toPolicies } = await import("../lib/aeon/tools-settings");
const { loadPracticeSettings } = await import("../lib/gfe/store");
const { syncCalendar } = await import("../lib/compliance/store");
const { loadCredentialingProfile } = await import("../lib/credentialing/store");

const BY = "chat:settings-test";
/** Runs a tool's own code with parsed input, as runTool does after its checks (the PHI guard needs a model these tests don't download). */
async function run(name: string, args: unknown) {
  const t = TOOLS_BY_NAME.get(name)!;
  const { z } = await import("zod");
  const input = z.object(t.input).parse(args);
  const result = await t.run(input as never, { by: BY });
  return { result, body: JSON.parse(result.content[0].text) as Record<string, unknown> };
}

let saved: Record<string, unknown> | null = null;
let startedAt: Date;

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
  await sql`delete from practice_os.memories where created_at >= ${startedAt} and source = ${BY}`;
  await closeDb();
});

describe("settings tools are registered", () => {
  it("are in the shared tool list, change data and are refused on the view-only copy", async () => {
    for (const name of ["set_fees", "set_office_days", "set_license_type", "set_practice_policies"]) {
      const t = TOOLS.find((x) => x.name === name);
      expect(t, name).toBeTruthy();
      expect(t!.changesData).toBe(true);
      const r = await runTool(name, {}, { by: BY, viewOnly: true });
      expect(r.isError).toBe(true);
    }
    expect(TOOLS_BY_NAME.get("get_practice_settings")!.changesData).toBe(false);
  });
});

describe("plain-code pieces", () => {
  const FEES = [
    { code: "90791", label: "First session (intake)", cents: 20000 },
    { code: "90834", label: "Therapy, 38-52 minutes", cents: 15000 },
    { code: "90837", label: "Therapy, 53 minutes or longer", cents: 17500 },
  ];

  it("'150 intake 130 sessions' changes the intake code and every therapy code on her list", () => {
    const { fees, changed } = applyFees(FEES, [
      { service: "intake", dollars: 150 },
      { service: "follow_up", dollars: 130 },
    ]);
    expect(fees.map((f) => [f.code, f.cents])).toEqual([["90791", 15000], ["90834", 13000], ["90837", 13000]]);
    expect(changed.map((c) => c.code)).toEqual(["90791", "90834", "90837"]);
    expect(changed[0]).toMatchObject({ from: "$200.00", to: "$150.00" });
  });

  it("adds a known code with its label and refuses an unknown one without a label", () => {
    expect(applyFees([], [{ code: "90832", dollars: 90 }]).fees).toEqual([{ code: "90832", label: "Therapy, 30 minutes", cents: 9000 }]);
    expect(() => applyFees([], [{ code: "99999", dollars: 90 }])).toThrow(/label/);
  });

  it("turns policy dollars into the stored cents", () => {
    expect(toPolicies({ cancel_hours: 24, late_cancel_fee_dollars: 100 })).toEqual({ cancel_hours: 24, late_cancel_fee_cents: 10000 });
  });

  it.each([
    ["Fee for 90837 is $175.", "set_fees"],
    ["My intake fee is 150 and sessions are 130", "set_fees"],
    ["She is an LCSW, not an LCPC.", "set_license_type"],
    ["Sees clients Monday to Thursday.", "set_office_days"],
    ["24 hour cancellation policy with a late cancellation fee", "set_practice_policies"],
  ])("remember redirects a setting: %s", (text, tool) => {
    expect(settingFor(text)?.tool).toBe(tool);
  });

  it.each(["Prefers Tuesday consults.", "Does not take Medicaid.", "Superbill posts got the most saves.", "Wants reminders a week before CAQH is due."])(
    "keeps an ordinary memory: %s",
    (text) => {
      expect(settingFor(text)).toBeNull();
    },
  );
});

describe.skipIf(!hasDb)("settings tools write the real stores", () => {
  it("set_fees changes the fee list Good Faith Estimates price from, and audits it", async () => {
    const { body } = await run("set_fees", { changes: [{ service: "intake", dollars: 150 }, { service: "follow_up", dollars: 130 }] });
    expect(body.saved).toBe(true);
    const { fees } = await loadPracticeSettings();
    expect(Object.fromEntries(fees.map((f) => [f.code, f.cents]))).toMatchObject({ "90791": 15000, "90834": 13000, "90837": 13000 });
    const [a] = await db()`select actor, details from practice_os.audit_log where action = 'office_settings_saved' order by id desc limit 1`;
    expect(a).toMatchObject({ actor: "aeon", details: expect.objectContaining({ by: BY }) });
  });

  it("set_fees refuses a bad change and says it didn't save", async () => {
    const { result, body } = await run("set_fees", { changes: [{ code: "99999", dollars: 50 }] });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, saved: false });
  });

  it("set_office_days replaces the open days and adds a closed date", async () => {
    const { body } = await run("set_office_days", { weekdays: ["monday", "tuesday", "wednesday"], add_closed_on: ["2026-12-24"] });
    expect(body).toMatchObject({ saved: true, open_days: ["Monday", "Tuesday", "Wednesday"] });
    const { hours } = await loadPracticeSettings();
    expect(hours.weekdays).toEqual([1, 2, 3]);
    expect(hours.closed_on).toContain("2026-12-24");
  });

  it("set_license_type changes the profile, credentialing and calendar", async () => {
    const { body } = await run("set_license_type", { license_type: "LCSW" });
    expect(body).toMatchObject({ saved: true, from: "LCPC", to: "LCSW", license_line: "Dana Reyes, LCSW (fictional demo practice)" });
    const [p] = await db()`select credential from practice_os.clinician_profile limit 1`;
    expect(p.credential).toBe("LCSW");
    const cred = await loadCredentialingProfile();
    expect(cred?.identity.credential).toBe("LCSW");
    expect(cred?.license.type).toMatch(/Social Worker/);
    const rules = await db()<{ rule_id: string }[]>`select rule_id from practice_os.obligations where rule_id like 'il_%_renewal'`;
    expect(rules.map((r) => r.rule_id)).toContain("il_lcsw_renewal");
    expect(rules.map((r) => r.rule_id)).not.toContain("il_lcpc_renewal");
    const [a] = await db()`select actor, details from practice_os.audit_log where action = 'license_type_changed' order by id desc limit 1`;
    expect(a).toMatchObject({ actor: "aeon", details: { by: BY, from: "LCPC", to: "LCSW" } });
  });

  it("set_practice_policies saves the policies the client-form PDFs read, and says which forms still can't download", async () => {
    const { body } = await run("set_practice_policies", { cancel_hours: 24, late_cancel_fee_dollars: 100 });
    expect(body).toMatchObject({ saved: true, changed: ["cancel_hours", "late_cancel_fee_cents"] });
    expect(body.policies).toMatchObject({ cancel_hours: 24, late_cancel_fee_cents: 10000 });
    expect(body.forms).toMatchObject({ ready: expect.any(Number), not_ready: expect.any(Array) });
    const [row] = await db()`select overrides from practice_os.client_form_templates where form_type = '_practice'`;
    expect(row.overrides).toMatchObject({ cancel_hours: 24, late_cancel_fee_cents: 10000 });
    // Saved once, so "policies never saved" no longer blocks any form.
    for (const f of (body.forms as { not_ready: { why: string }[] }).not_ready) expect(f.why).not.toMatch(/practice policies/i);
  });

  it("get_practice_settings reads back what was saved", async () => {
    const { body } = await run("get_practice_settings", {});
    expect(body).toMatchObject({ license_type: "LCSW", policies_saved: true, open_days: ["Monday", "Tuesday", "Wednesday"] });
  });

  it("remember refuses a fee and names the settings tool, saving nothing", async () => {
    const { result, body } = await run("remember", { kind: "fact", text: "Fee for 90837 is $175." });
    expect(result.isError).toBe(true);
    expect(body).toMatchObject({ ok: false, saved: false, use_tool: "set_fees" });
    const rows = await db()`select id from practice_os.memories where created_at >= ${startedAt} and source = ${BY}`;
    expect(rows).toHaveLength(0);
  });
});
