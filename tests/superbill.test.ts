// Superbills without a database: the fixed lists, the pricing rules, and the
// sample PDF read back with mupdf (a different library from the pdf-lib that
// wrote it) and checked against the CMS-1500 field map in docs/research.md.
import * as mupdf from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";
import { DANA_PROFILE, SAMPLE_NPI, SAMPLE_TIN } from "../lib/credentialing/demo";
import { cptForMinutes } from "../lib/superbill/codes";
import { sampleSuperbill, SAMPLE_SUPERBILL_INPUT } from "../lib/superbill/demo";
import { CLIENT_FIELDS, DIAGNOSIS_FIELDS, MissingProviderDetails, renderSuperbillPdf } from "../lib/superbill/pdf";
import { priceSuperbill, superbillInputSchema } from "../lib/superbill/store";

const FEES = [{ code: "90837", label: "Therapy, 60 minutes", cents: 17_500 }];
const line = { date_of_service: "2026-10-06", cpt: "90837", pos: "10", modifier: "95" } as const;

let text = "";
const widgets: { name: string; value: string }[] = [];

beforeAll(async () => {
  const bytes = await renderSuperbillPdf(sampleSuperbill(), DANA_PROFILE, "2026-10-27");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as mupdf.PDFPage;
    text += `${page.toStructuredText("preserve-whitespace").asText()}\n`;
    widgets.push(...page.getWidgets().map((wd) => ({ name: wd.getName(), value: wd.getValue() })));
  }
  text = text.replace(/\s+/g, " ");
});

describe("superbill codes and pricing", () => {
  it("picks the CPT code from session length (16-37, 38-52, 53+)", () => {
    expect([16, 37, 38, 52, 53, 90].map(cptForMinutes)).toEqual(["90832", "90832", "90834", "90834", "90837", "90837"]);
    expect(() => cptForMinutes(15)).toThrow(/16 minutes/);
  });

  it("fills fees from her fee list and totals the lines", () => {
    const p = priceSuperbill({ lines: [line, { ...line, date_of_service: "2026-10-13" }], paid_cents: 17_500 }, FEES, "2026-10-27");
    expect(p).toMatchObject({ total_cents: 35_000, paid_cents: 17_500 });
    expect(p.lines[0]).toMatchObject({ units: 1, cents: 17_500, dx_pointers: ["A"] });
  });

  it("refuses future dates, extra units, telehealth modifiers on office visits, overpayment and unknown fees", () => {
    expect(() => priceSuperbill({ lines: [{ ...line, date_of_service: "2026-11-01" }] }, FEES, "2026-10-27")).toThrow(/hasn't happened/);
    expect(() => priceSuperbill({ lines: [{ ...line, units: 2 }] }, FEES, "2026-10-27")).toThrow(/one unit/);
    expect(() => priceSuperbill({ lines: [{ ...line, pos: "11" }] }, FEES, "2026-10-27")).toThrow(/office visit/);
    expect(() => priceSuperbill({ lines: [line], paid_cents: 20_000 }, FEES, "2026-10-27")).toThrow(/more than the total/);
    expect(() => priceSuperbill({ lines: [{ ...line, cpt: "90834" }] }, FEES, "2026-10-27")).toThrow(/fee list/);
  });

  it("has nowhere to put a client's details: strict schemas refuse any extra field", () => {
    for (const extra of [{ client_name: "Jordan Example" }, { diagnosis: "F41.1" }, { note: "anything" }]) {
      expect(superbillInputSchema.safeParse({ ...SAMPLE_SUPERBILL_INPUT, ...extra }).success).toBe(false);
      expect(superbillInputSchema.safeParse({ lines: [{ ...line, ...extra }] }).success).toBe(false);
    }
    expect(superbillInputSchema.safeParse({ lines: [{ ...line, cpt: "Jordan" }] }).success).toBe(false);
  });
});

describe("sample superbill PDF, read back", () => {
  it("carries the provider block from the credentialing profile (items 24J, 25, 33)", () => {
    expect(text).toContain("Reyes Counseling PLLC (fictional demo practice)");
    expect(text).toContain("Dana Reyes, LCPC (fictional demo practice)");
    expect(text).toContain(`${SAMPLE_NPI} [Sample]`);
    expect(text).toContain(`${SAMPLE_TIN} [Sample]`);
    expect(text).toContain("Chicago, IL 60614");
  });

  it("lists each service with date, place, CPT, modifier, pointer, units and charge (item 24)", () => {
    for (const d of ["10/05/2026", "10/12/2026", "10/19/2026", "10/26/2026"]) expect(text).toContain(d);
    expect(text.match(/90837/g)?.length).toBeGreaterThanOrEqual(4);
    expect(text).toMatch(/95 10 A 1 \$175\.00/);
    expect(text).toContain("10 Telehealth provided in patient's home");
  });

  it("totals $700 charged, $700 paid, $0 due (item 29)", () => {
    expect(text).toMatch(/Total charges \$700\.00/);
    expect(text).toMatch(/Amount paid \(item 29\) \$700\.00/);
    expect(text).toMatch(/Balance due \$0\.00/);
  });

  it("leaves every client and diagnosis box blank and fillable", () => {
    const expected = [...CLIENT_FIELDS, ...DIAGNOSIS_FIELDS].map((f) => f.name).sort();
    expect(widgets.map((wd) => wd.name).sort()).toEqual(expected);
    for (const wd of widgets) expect(wd.value).toBe("");
  });

  it("is labeled [Sample], shows no license number, and is not signed", () => {
    expect(text).toContain("[Sample]");
    expect(text).not.toMatch(/license (number|no\.?|#)/i);
    expect(text).toContain("never signs or sends it");
  });

  it("refuses to render without her NPI and tax ID", async () => {
    await expect(renderSuperbillPdf(sampleSuperbill(), { ...DANA_PROFILE, tin: null }, "2026-10-27")).rejects.toThrow(MissingProviderDetails);
  });
});
