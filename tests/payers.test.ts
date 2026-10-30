// Payer forms and applications. The CMS-855I is filled from Dana's [Sample]
// profile and read back out of the real form with pdf-lib.
import { PDFCheckBox, PDFDocument, PDFTextField } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { loadEnv } from "../lib/env";
import { LEFT_FOR_YOU, cms855iEntries, fillCms855i, specialtyFor } from "../lib/payers/cms855i";
import { payerDates, withDefaults, type PayerApplication } from "../lib/payers/store";

loadEnv();
const hasDb = Boolean(process.env.DATABASE_URL);

describe("CMS-855I filling", () => {
  let form: ReturnType<PDFDocument["getForm"]>;
  let filled: Awaited<ReturnType<typeof fillCms855i>>;

  beforeAll(async () => {
    filled = await fillCms855i(DANA_PROFILE);
    form = (await PDFDocument.load(filled.bytes)).getForm();
  });

  const text = (name: string) => (form.getField(name) as PDFTextField).getText() ?? "";
  const checked = (name: string) => (form.getField(name) as PDFCheckBox).isChecked();

  it("fills every mapped field, skips none", () => {
    expect(filled.skipped).toEqual([]);
    expect(filled.filled.length).toBe(cms855iEntries(DANA_PROFILE).length);
  });

  it("2A/2B: name, NPI, school, active license and state", () => {
    expect(text("5-1")).toBe("Dana");
    expect(text("5-3")).toBe("Reyes");
    expect(text("5-13")).toBe("1999999901");
    expect(text("5-14")).toBe("Example University");
    expect(text("5-15")).toBe("2019");
    expect(checked("CheckBox5-4")).toBe(true);
    expect(text("5-18")).toBe("IL");
  });

  it("2H: an LCPC gets the write-in specialty MHC, per CMS's FAQ", () => {
    expect(checked("CheckBox43")).toBe(true);
    expect(text("8-1")).toBe("Mental Health Counselor (MHC)");
    expect(checked("CheckBox32")).toBe(false); // Clinical Social Worker
  });

  it("4: business name, tax ID and the practice location, street split into two lines", () => {
    expect(text("11-1")).toBe("Reyes Counseling PLLC");
    expect(text("11-2")).toBe("00-1234567");
    expect(text("12-4")).toBe("2400 N Example Ave");
    expect(text("12-5")).toBe("Suite 2");
    expect(text("12-8")).toBe("60614");
  });

  it("leaves SSN, date of birth, license number, the sole-proprietor EIN and both signatures empty", () => {
    for (const f of ["5-10", "5-11", "5-16", "5-17", "12-1"]) expect(text(f)).toBe("");
    const signatures = form.getFields().filter((f) => f.constructor.name === "PDFSignature");
    expect(signatures).toHaveLength(2);
    expect(filled.leftForYou).toEqual(LEFT_FOR_YOU);
    expect(LEFT_FOR_YOU.some((l) => /signature/i.test(l))).toBe(true);
  });

  it("keeps the form editable so she can finish it", () => {
    expect(form.getFields().length).toBe(513);
  });
});

describe("specialty mapping", () => {
  it("LCSW has its own box; counselors and MFTs use the write-in", () => {
    expect(specialtyFor("LCSW")?.checkbox).toBe("CheckBox32");
    expect(specialtyFor("LMFT")).toMatchObject({ checkbox: "CheckBox43", writeIn: "Marriage and Family Therapist (MFT)" });
    expect(specialtyFor("LPC")?.writeIn).toBe("Mental Health Counselor (MHC)");
    expect(specialtyFor("Psychologist")?.checkbox).toBe("CheckBox38");
    expect(specialtyFor("Something else")).toBeNull();
  });
});

describe("application dates", () => {
  const today = "2026-10-27";
  it("applied: follow up 30 days later; approved: recredential 36 months later", () => {
    expect(withDefaults({ payer: "BCBSIL", status: "applied", applied_on: "2026-10-05" }, today)).toMatchObject({ follow_up_on: "2026-11-04" });
    expect(withDefaults({ payer: "Cigna", status: "applied" }, today)).toMatchObject({ applied_on: today, follow_up_on: "2026-11-26" });
    expect(withDefaults({ payer: "Aetna", status: "approved", applied_on: "2026-01-12", approved_on: "2026-03-16" }, today)).toMatchObject({
      recredential_on: "2029-03-16",
      follow_up_on: null,
    });
  });

  it("lists follow-ups and recredential dates in the window, overdue included", () => {
    const base = { form: null, catalog_id: null, network: null, stage: "credentialing" as const, effective_on: null, reference: null, notes: null, is_sample: true, approved_on: null, recredential_on: null };
    const apps: PayerApplication[] = [
      { ...base, id: "a", payer: "BCBSIL", status: "applied", applied_on: "2026-10-05", follow_up_on: "2026-11-04" },
      { ...base, id: "b", payer: "Old", status: "pending", applied_on: "2026-08-01", follow_up_on: "2026-08-31" },
      { ...base, id: "c", payer: "Aetna", status: "approved", applied_on: "2026-01-12", follow_up_on: null, approved_on: "2026-03-16", recredential_on: "2029-03-16" },
    ];
    const due = payerDates(apps, today, 30);
    expect(due.map((d) => [d.payer, d.kind, d.days_left])).toEqual([
      ["Old", "follow_up", -57],
      ["BCBSIL", "follow_up", 8],
    ]);
  });
});

describe.skipIf(!hasDb)("payer applications in the database", async () => {
  const { closeDb, db } = await import("../lib/db");
  const { savePayerApplication } = await import("../lib/payers/store");
  const made: string[] = [];
  afterAll(async () => {
    if (made.length) await db()`delete from practice_os.payer_applications where id in ${db()(made)}`;
    await closeDb();
  });

  it("adds a payer, then marks it applied with a 30-day follow-up, audited", async () => {
    const a = await savePayerApplication({ payer: "Vitest Payer", status: "preparing" }, "test");
    made.push(a.id);
    expect(a).toMatchObject({ status: "preparing", applied_on: null });
    const b = await savePayerApplication({ id: a.id, payer: "Vitest Payer", status: "applied", applied_on: "2026-10-20" }, "test");
    expect(b).toMatchObject({ applied_on: "2026-10-20", follow_up_on: "2026-11-19" });
    const [row] = await db()`select details from practice_os.audit_log where subject_id = ${a.id} order by id desc limit 1`;
    expect(row.details).toMatchObject({ status: "applied", by: "test" });
  });

  it("the database refuses 'approved' without an approval date", async () => {
    await expect(
      db()`insert into practice_os.payer_applications (payer, status, applied_on) values ('Bad', 'approved', '2026-01-01')`,
    ).rejects.toThrow(/check/);
  });
});
