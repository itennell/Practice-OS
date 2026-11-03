// "Who should I reach out to this week?": the outreach plan from the demo seed plus NPPES-style
// cards (names like the live board's), and the ways Muse words it, through the real reply guard
// (lib/aeon/guard.ts). A professional's caseload ("her patients often deal with grief", "newly
// diagnosed patients") is who they serve, not a client detail; a provider's own health still is.
// Fictional people only.
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
loadEnv();
const local = process.env.SUPABASE_PROJECT_REF === "local";

describe.skipIf(!local)("the outreach plan through the real reply guard", async () => {
  const { resetDemoData } = await import("../lib/demo-reset");
  const { closeDb, db } = await import("../lib/db");
  const { outreachPlan } = await import("../lib/referrals/plan");
  const { guard, forgetAllowlist } = await import("../lib/aeon/guard");
  const NAMES = ["Claudia Tellez, MD", "Brittany Keiser, MS, CGC", "Emilie Blair"];
  let summary = "";

  beforeAll(async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "practice-os-plan-guard-"));
    await resetDemoData({ url: process.env.DATABASE_URL!, expectedRef: "local", dir });
    await db()`insert into practice_os.referral_sources (name, organization, taxonomy, specialty, npi_type, credential, city, state, stage, distance_miles, npi, score_version) values
      ('Claudia Tellez, MD', 'Lakeshore Oncology Associates', '207RX0202X', 'Medical oncology', 'individual', 'MD', 'Chicago', 'IL', 'found', 0.6, '1999999991', 0),
      ('Brittany Keiser, MS, CGC', 'Northside Cancer Genetics', '170300000X', 'Genetic counselor', 'individual', 'MS, CGC', 'Chicago', 'IL', 'found', 0.9, '1999999992', 0),
      ('Emilie Blair', 'Northside Cancer Genetics', '170300000X', 'Genetic counselor', 'individual', 'MS, CGC', 'Chicago', 'IL', 'found', 0.9, '1999999993', 0)`;
    forgetAllowlist();
    summary = (await outreachPlan(db())).summary;
  }, 120_000);
  afterAll(async () => {
    await db()`delete from practice_os.referral_sources where npi in ('1999999991', '1999999992', '1999999993')`;
    forgetAllowlist();
    await closeDb();
  });

  it("the plan names the NPPES-style cards and passes as written", async () => {
    for (const n of NAMES) expect(summary).toContain(n);
    // The hospice coordinator's follow-up is first; its last contact (a referral) once read as a birth date.
    expect(summary).toMatch(/Hollis Vance: today \(last: they sent you a referral on/);
    const r = await guard(`Here's who to reach out to this week:\n\n${summary}`, "reply");
    expect(r.ok).toBe(true);
  });

  it("a referral logged on a day isn't a birth date; a person with a date still is", async () => {
    expect((await guard("- [Sample] Hollis Vance: today (last: they referred someone on 2026-10-25)", "reply")).ok).toBe(true);
    expect((await guard("They referred someone over on 2026-10-25, and you met on 2026-10-28.", "reply")).ok).toBe(true);
    for (const t of ["Her son (3-14-15) wants a therapist.", "They referred someone born 3/14/2015.", "(3/14/2015) canceled her visit and someone else called."]) {
      expect((await guard(t, "reply")).ok).toBe(false);
    }
  });

  const PASS = (n: string) => [
    `Reach out to ${n} this week: oncologist 0.6 mi away who sees adults with cancer, a strong fit for your end-of-life focus.`,
    `${n} — genetic counselor, 0.9 mi. Fits your oncology and end-of-life focus.`,
    `1. ${n} (Genetic counselor, 0.9 mi): works with families after a cancer diagnosis.`,
    `Start with ${n}. She sees patients facing a hereditary cancer diagnosis, which fits who you help.`,
    // The two the live reply tripped on: a caseload, and "newly diagnosed patients".
    `${n} could be a good partner since her patients often deal with grief and serious illness.`,
    `Try ${n}; she's newly diagnosed patients' first stop.`,
    `${n} would be a strong partner: their families often face a cancer diagnosis together.`,
    `**${n}** – Medical oncology · 0.6 mi · Fits your oncology and end-of-life focus.`,
  ];
  it.each(NAMES.flatMap((n) => PASS(n)))("passes: %s", async (t) => {
    expect((await guard(t, "reply")).ok).toBe(true);
  });

  // Still a person's health, or a client: held back (or the name blanked).
  const HOLD = [
    "Claudia Tellez could be a good partner, but her husband has dementia.",
    "Emilie Blair has cancer, so wait a few weeks.",
    "Emilie Blair was just diagnosed with breast cancer.",
    "Brittany Keiser's patient Kevin Ortiz has leukemia.",
    "Emilie Blair could be a good partner since her patients deal with grief; her son is in rehab.",
    "My client Jamie Ortiz has newly diagnosed diabetes.",
  ];
  it.each(HOLD)("holds back: %s", async (t) => {
    const r = await guard(t, "reply");
    expect(r.ok && r.text === t).toBe(false);
  });
});
