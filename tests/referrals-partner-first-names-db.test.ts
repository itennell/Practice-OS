// "Set a meeting with Maria, Pamela and Birinder", end to end against the built-in throwaway
// database only: the real guard (real name-finder, her board read by practiceAllowlist) lets
// the message through, and plan_referral_meeting queues one approval per partner in Manual
// mode and books nothing. A do-not-fit card resolves (no privacy refusal) but the tool refuses
// it in plain words. Fictional cards only; dates far ahead (2031).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { projectRefOf } from "../lib/demo-reset";

loadEnv();
const dbUrl = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL) : null;
const local = Boolean(dbUrl && ["localhost", "127.0.0.1", "::1"].includes(dbUrl.hostname) && projectRefOf(dbUrl.toString()) === "local");

const { closeDb, db } = await import("../lib/db");
const { runTool } = await import("../lib/aeon/tools");
const { guard, forgetAllowlist } = await import("../lib/aeon/guard");

const CHI = "America/Chicago";
const BY = "chat:partner-first-names-test";
const made: string[] = [];
const approvals: string[] = [];
let saved: { timezone: string; office_hours: unknown } | null = null;

async function makePerson(name: string, stage = "found", sensitive = false) {
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.referral_sources (name, organization, specialty, npi_type, address, city, state, zip, stage, distance_miles, phone, is_sample, sensitive)
    values (${name}, null, 'Oncology', 'individual', ${sensitive ? null : "200 W Firstname St"}, 'Chicago', 'IL', ${sensitive ? null : "60614"}, ${stage}, ${sensitive ? null : 0.6}, '312-555-0177', true, ${sensitive})
    returning id`;
  made.push(row.id);
  return row.id;
}

const json = (r: { content: { text: string }[] }) => JSON.parse(r.content[0].text) as Record<string, unknown>;

describe.skipIf(!local)("partners named by first name (built-in database only)", () => {
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const [s] = await db()<{ timezone: string }[]>`select timezone from practice_os.settings limit 1`;
    const [p] = await db()<{ office_hours: unknown }[]>`select office_hours from practice_os.clinician_profile limit 1`;
    saved = { timezone: s?.timezone ?? CHI, office_hours: p?.office_hours ?? null };
    await db()`update practice_os.settings set timezone = ${CHI}`;
    await db()`update practice_os.clinician_profile set office_hours = ${db().json({ weekdays: [1, 2, 3, 4, 5], closed_on: [], close_federal_holidays: true } as never)}`;
    await db()`delete from practice_os.referral_meetings where starts_at >= '2031-03-01' and starts_at < '2031-04-01'`;
    ids.Maria = await makePerson("Maria Halvorsen, MS");
    ids.Pamela = await makePerson("PAMELA SERRANO VIDAL, MD");
    ids.Birinder = await makePerson("Birinder Malhi, MD");
    ids.Odalys = await makePerson("Odalys Brennecke, LCSW", "not_a_fit");
    ids.Thessaly = await makePerson("Thessaly Quorn, LCSW", "found", true);
    forgetAllowlist();
  });

  afterAll(async () => {
    if (saved) {
      await db()`update practice_os.settings set timezone = ${saved.timezone}`;
      if (saved.office_hours) await db()`update practice_os.clinician_profile set office_hours = ${db().json(saved.office_hours as never)}`;
    }
    if (approvals.length) await db()`delete from practice_os.approvals where id in ${db()(approvals)}`;
    if (made.length) await db()`delete from practice_os.referral_sources where id in ${db()(made)}`;
    forgetAllowlist();
    await closeDb();
  });

  it("the real guard, reading her board, passes the message and still refuses a stranger", async () => {
    const said = "set a meeting with Maria, Pamela and Birinder";
    expect(await guard(said, "message", undefined, { askWhichPartner: true })).toEqual({ ok: true, text: said });
    expect((await guard("set a meeting with Odalys", "message", undefined, { askWhichPartner: true })).ok).toBe(true);
    expect((await guard("set a meeting with Thessaly", "message", undefined, { askWhichPartner: true })).ok).toBe(true);
    expect((await guard("set a meeting with Maria, Pamela and Joe", "message", undefined, { askWhichPartner: true })).ok).toBe(false);
  }, 240_000);

  it("plan_referral_meeting queues three approvals in Manual mode and books nothing", async () => {
    const seen = new Set<string>();
    for (const [i, partner] of ["Maria", "Pamela", "Birinder"].entries()) {
      const day = `2031-03-${String(10 + i).padStart(2, "0")}`;
      const out = json(await runTool("plan_referral_meeting", { partner, kind: "meeting", from: day, to: day }, { by: BY, mode: "manual" }));
      expect(out, partner).toMatchObject({ queued: true, booked: false, waiting_for_her: true, where: "her Approvals" });
      approvals.push(out.approval_id as string);
      const [row] = await db()<{ status: string; payload: { referral_source_id: string } }[]>`
        select status, payload from practice_os.approvals where id = ${out.approval_id as string}`;
      expect(row.status).toBe("pending");
      expect(row.payload.referral_source_id).toBe(ids[partner]);
      seen.add(row.payload.referral_source_id);
    }
    expect(seen.size).toBe(3);
    const booked = await db()`select id from practice_os.referral_meetings where source_id in ${db()(made)}`;
    expect(booked.length).toBe(0);
  }, 120_000);

  it("a Not a fit or sensitive partner resolves, and the meeting tool refuses it in plain words", async () => {
    const notFit = json(await runTool("plan_referral_meeting", { partner: "Odalys", kind: "coffee", from: "2031-03-14", to: "2031-03-14" }, { by: BY, mode: "manual" }));
    expect(notFit.queued).toBe(false);
    expect(String(notFit.why)).toMatch(/Not a fit, so I won't plan a meeting/);
    const hidden = json(await runTool("plan_referral_meeting", { partner: "Thessaly", kind: "coffee", from: "2031-03-14", to: "2031-03-14" }, { by: BY, mode: "manual" }));
    expect(hidden.queued).toBe(false);
    expect(String(hidden.why)).toMatch(/keeps private, so I won't plan a meeting/);
  }, 60_000);
});
