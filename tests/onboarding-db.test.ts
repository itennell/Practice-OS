// A fresh install, end to end: an empty database, one run through the interview, and
// every feature's table filled in. It empties the practice tables first, so it runs
// ONLY against a throwaway local database (localhost) and only when you ask for it with
// ONBOARDING_FRESH_DB_TEST=1, never the shared Supabase one, and puts Dana's demo
// practice back afterwards (scripts/db-reset.ts).
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const url = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = process.env.ONBOARDING_FRESH_DB_TEST === "1" && Boolean(url && ["localhost", "127.0.0.1", "::1"].includes(url.hostname));

const { closeDb, db } = await import("../lib/db");
const store = await import("../lib/onboarding/store");

const FRESH = ["clinician_profile", "compliance_facts", "settings", "credentialing_profile", "payer_applications", "obligations", "memories"];

beforeAll(async () => {
  if (!local) return;
  await db().unsafe(`truncate ${FRESH.map((t) => `practice_os.${t}`).join(", ")} cascade`);
});

afterAll(async () => {
  if (!local) return;
  await closeDb();
  const reset = spawnSync("npx", ["tsx", "scripts/db-reset.ts"], { env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL }, encoding: "utf8" });
  if (reset.status !== 0) console.error(reset.stderr);
});

describe.skipIf(!local)("onboarding on a fresh install", () => {
  it("keeps the first answers in the browser until the license type creates her profile", async () => {
    const first = await store.saveAnswers({ name: "Sam Example", practice_name: "" });
    expect(first.pending).toBe(true);
    expect(first.state.hasProfile).toBe(false);

    const made = await store.saveAnswers({ name: "Sam Example", practice_name: "", state: "IL", license: "LCSW" }, { current: "contact" });
    expect(made.pending).toBe(false);
    const [p] = await db()`select full_name, practice_name, credential, state, practice_stage, license_line from practice_os.clinician_profile`;
    expect(p).toMatchObject({ full_name: "Sam Example", practice_name: "Sam Example", credential: "LCSW", state: "IL", practice_stage: "beginning", license_line: "Sam Example, LCSW" });
    const [s] = await db()`select timezone from practice_os.settings`;
    expect(s.timezone).toBe("America/Chicago");
  });

  it("saves every chapter to the table that owns it", { timeout: 120_000 }, async () => {
    const run: Record<string, unknown>[] = [
      { contact: { email: "sam@example.com", phone: "312 555 0100" } },
      { sees_clients: "both" },
      { office: { street: "100 W Example St", city: "Chicago", state: "IL", zip: "60614", neighborhood: "Lincoln Park" } },
      { alert_phone: "(312) 555-0199" },
      { license_expires: "2027-11-30" },
      { ce: { first_renewal: false, hours: 12 } },
      { adults_26: true },
      { npi: "1234567893" },
      { pllc: { yes: true, date: "2026-01-15" } },
      { entity_tax: "single_owner" },
      { ein: "123456789" },
      { staff: { employees: 0, contractors: true } },
      { malpractice: { carrier: "Example Mutual", expires_on: "2027-06-30", per_claim: 1_000_000, aggregate: 3_000_000 } },
      { office_days: { weekdays: [1, 2, 3, 4], close_federal_holidays: true } },
      { fees: [{ code: "90791", label: "First visit", cents: 20000 }, { code: "90837", label: "53+ minute session", cents: 17500 }, { code: "90834", label: "45 minute session", cents: 0 }] },
      { insurance: "some" },
      { payers: ["Aetna", "Medicare"] },
      { bcbsil: false },
      { medicare: { status: "enrolled", date: "2029-03-01" } },
      { medicaid: { yes: false, date: null } },
      { caqh: "2026-09-01" },
      { who: { chips: ["Adults", "Couples"], work: ["Evenings"], text: "Work stress and life changes" } },
      { stage: "middle" },
      { uses_texting: true },
      { mode: "manual" },
      { text_missed_callers: false },
      { team: { admin: true, referrals: true, instagram: false, front_desk: true } },
    ];
    for (const answer of run) await store.saveAnswers(answer);

    const sql = db();
    const [f] = await sql`select * from practice_os.compliance_facts`;
    expect(f).toMatchObject({
      city_code: "CHI",
      first_renewal: false,
      sees_adults_26_plus: true,
      has_pllc: true,
      entity_tax: "single_owner",
      employee_count: 0,
      has_contractors: true,
      bills_insurance_electronically: true,
      medicare: "enrolled",
      medicaid_enrolled: false,
      uses_texting: true,
    });
    expect(Number(f.ce_hours_done)).toBe(12);
    expect(f.license_expires_on.toISOString().slice(0, 10)).toBe("2027-11-30");

    const [c] = await sql`select identity, practice_location, npi, tin, malpractice, license from practice_os.credentialing_profile`;
    expect(c.identity).toMatchObject({ name: "Sam Example", credential: "LCSW", email: "sam@example.com", phone: "(312) 555-0100" });
    expect(c.practice_location).toMatchObject({ street: "100 W Example St", zip: "60614", telehealth: true });
    expect(c).toMatchObject({ npi: "1234567893", tin: "12-3456789" });
    expect(c.license).toMatchObject({ type: "LCSW", state: "IL" });
    expect(JSON.stringify(c.license)).not.toMatch(/number/i);

    const [p] = await sql`select practice_stage, city, neighborhood, office_hours, fee_schedule, onboarding_answers from practice_os.clinician_profile`;
    expect(p).toMatchObject({ practice_stage: "middle", city: "Chicago", neighborhood: "Lincoln Park" });
    expect(p.office_hours.weekdays).toEqual([1, 2, 3, 4]);
    expect(p.fee_schedule.map((x: { code: string }) => x.code)).toEqual(["90791", "90837"]); // an empty box isn't offered
    expect(p.onboarding_answers.who_i_help).toBe("Adults; Couples; Work stress and life changes");

    const [s] = await sql`select alert_phone, approval_mode, front_desk_rules, helpers_enabled from practice_os.settings`;
    expect(s).toMatchObject({ alert_phone: "+13125550199", approval_mode: "manual", front_desk_rules: { text_missed_callers: false } });
    expect(s.helpers_enabled.instagram).toBe(false);

    const payers = await sql`select payer, status from practice_os.payer_applications order by payer`;
    expect(payers.map((x) => [x.payer, x.status])).toEqual([["Aetna", "preparing"], ["Medicare", "preparing"]]);

    const memories = await sql`select text from practice_os.memories where source = 'onboarding' order by text`;
    expect(memories.map((m) => m.text)).toEqual(["Likes to work: Evenings", "Works with: Adults; Couples; Work stress and life changes"]);

    const setup = await sql`select count(*)::int as n from practice_os.obligations where kind = 'setup'`;
    expect(setup[0].n).toBeGreaterThan(0); // the calendar was built from her facts
  });

  it("answers setup questions through the existing setup flow", async () => {
    const state = await store.loadOnboarding();
    const item = state.setupItems[0];
    expect(item).toBeTruthy();
    await store.saveAnswers({ setup: { [item.id]: "done" } });
    const [o] = await db()`select status from practice_os.obligations where id = ${item.id}`;
    expect(o.status).toBe("done");
  });

  it("refuses bad input in plain words and saves nothing", async () => {
    await expect(store.saveAnswers({ ein: "12345" })).rejects.toThrow(/9 digits/);
    await expect(store.saveAnswers({ alert_phone: "555" })).rejects.toThrow(/10-digit/);
  });

  it("lists what she put off on the home page once she finishes", async () => {
    await store.markSkipped("caqh", "later", null);
    expect(await store.stillToSetUp()).toEqual([]); // not finished yet
    const done = await store.finishOnboarding();
    expect(done.researchState).toBeNull(); // Illinois rules ship verified
    const todo = await store.stillToSetUp();
    expect(todo.map((t) => t.id)).toEqual(["caqh"]);
    const [p] = await db()`select onboarding_completed_at from practice_os.clinician_profile`;
    expect(p.onboarding_completed_at).toBeInstanceOf(Date);
  });
});
