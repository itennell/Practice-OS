// Credentialing profile and CAQH prep. Dates must match the compliance rules
// (and so the Deadlines page): Illinois re-attests every 180 days, other states
// every 120 (CAQH Provider User Guide 8.3).
import { describe, expect, it } from "vitest";
import { addDays } from "../lib/compliance/dates";
import { danaFacts } from "../lib/compliance/demo";
import { SHIPPED_RULES } from "../lib/compliance/rules";
import { buildCalendar } from "../lib/compliance/schedule";
import { ATTEST_YOURSELF, caqhPrep, unexplainedGaps } from "../lib/credentialing/checklist";
import { DANA_PROFILE, SAMPLE_NPI } from "../lib/credentialing/demo";
import { isValidNpi } from "../lib/credentialing/profile";

const TODAY = "2026-10-26";
const facts = danaFacts(TODAY);

describe("CAQH prep for Dana", () => {
  const prep = caqhPrep(DANA_PROFILE, facts, SHIPPED_RULES, TODAY);

  it("re-attest date is last attested + 180 days, the same date the Deadlines calendar shows", () => {
    expect(prep.attestBy).toBe(addDays(facts.caqh_last_attested_on!, 180));
    expect(prep.attestBy).toBe("2026-11-04");
    const deadlines = buildCalendar(SHIPPED_RULES, facts, TODAY).due.find((d) => d.rule.category === "caqh_reattestation");
    expect(prep.attestBy).toBe(deadlines?.due_on);
    expect(prep.cycleDays).toBe(180);
  });

  it("license expiry comes from the Illinois LCPC renewal rule", () => {
    expect(prep.licenseExpiresOn).toBe("2027-03-31");
    expect(prep.items.find((i) => i.id === "license")?.done).toBe(true);
  });

  it("flags the malpractice face sheet expiring Dec 1 and the missing W-9", () => {
    const malpractice = prep.items.find((i) => i.id === "doc_malpractice");
    expect(malpractice?.done).toBe(false);
    expect(malpractice?.detail).toContain("Dec 1, 2026");
    expect(prep.items.find((i) => i.id === "doc_w9")?.done).toBe(false);
    expect(prep.items.find((i) => i.id === "doc_diploma")).toBeUndefined();
  });

  it("asks the Illinois disclosure questions and ends with the attest sentence", () => {
    expect(prep.items.find((i) => i.id === "disclosures")?.label).toContain("Illinois");
    expect(prep.finalStep).toBe("You must log in and click Attest yourself.");
    expect(ATTEST_YOURSELF).toBe("You must log in and click Attest yourself.");
  });

  it("never stores or shows a license number", () => {
    expect(DANA_PROFILE.license.numberStored).toBe(false);
    expect(JSON.stringify(DANA_PROFILE)).not.toMatch(/license_?number|\b\d{3}\.\d{6}\b/i);
  });
});

describe("other states", () => {
  it("a California practice gets the 120-day CAQH cycle from the rule pack", () => {
    const ca = { ...facts, practice_state: "CA" };
    const prep = caqhPrep(DANA_PROFILE, ca, SHIPPED_RULES, TODAY);
    expect(prep.cycleDays).toBe(120);
    expect(prep.attestBy).toBe(addDays(facts.caqh_last_attested_on!, 120));
    expect(prep.items.find((i) => i.id === "disclosures")?.label).not.toContain("Illinois");
  });

  it("with no CAQH date, the first item asks for it, worded like Deadlines", () => {
    const prep = caqhPrep(DANA_PROFILE, { ...facts, caqh_last_attested_on: null }, SHIPPED_RULES, TODAY);
    expect(prep.attestBy).toBeNull();
    expect(prep.items[0]).toMatchObject({ id: "caqh_date", label: "When did you last attest on CAQH?", done: false });
  });
});

describe("work history and NPI", () => {
  it("the NPI item is done only when NPPES found it with the same taxonomy", () => {
    const at = "2026-10-27T12:00:00.000Z";
    const item = (npiCheck: typeof DANA_PROFILE.npiCheck) =>
      caqhPrep({ ...DANA_PROFILE, npiCheck }, facts, SHIPPED_RULES, TODAY).items.find((i) => i.id === "npi")!;
    expect(item(null)).toMatchObject({ label: "Check your NPI against NPPES", done: false });
    expect(item({ checkedAt: at, found: false, name: null, taxonomy: null, matches: false })).toMatchObject({ done: false, you: true });
    expect(item({ checkedAt: at, found: true, name: "DANA REYES", taxonomy: "101YP2500X", matches: true })).toMatchObject({
      label: "NPI and taxonomy match NPPES",
      done: true,
    });
  });

  it("finds a gap over 6 months and clears it once explained", () => {
    const p = {
      ...DANA_PROFILE,
      workHistory: [
        { employer: "A", role: "x", from: "2019-01-01", to: "2020-01-31" },
        { employer: "B", role: "y", from: "2020-09-01", to: null },
      ],
    };
    expect(unexplainedGaps(p, TODAY)).toEqual([{ from: "2020-01-31", to: "2020-09-01" }]);
    expect(unexplainedGaps({ ...p, gapExplanations: [{ from: "2020-01-31", to: "2020-09-01", reason: "Exam prep" }] }, TODAY)).toEqual([]);
    expect(unexplainedGaps(DANA_PROFILE, TODAY)).toEqual([]);
  });

  it("the sample NPI passes the CMS check digit; a one-digit change fails", () => {
    expect(isValidNpi(SAMPLE_NPI)).toBe(true);
    expect(isValidNpi("1999999902")).toBe(false);
    expect(isValidNpi("3999999901")).toBe(false);
  });
});

describe.runIf(process.env.LIVE_NPPES === "1")("NPPES (live)", () => {
  it("the sample NPI belongs to no one", async () => {
    const res = await fetch(`https://npiregistry.cms.hhs.gov/api/?version=2.1&number=${SAMPLE_NPI}`);
    expect((await res.json()).result_count).toBe(0);
  });
});
