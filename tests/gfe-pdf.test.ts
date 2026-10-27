// The sample Good Faith Estimate, read back out of the rendered PDF with mupdf
// and checked against every element 45 CFR 149.610(c)(1) requires.
import * as mupdf from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";
import { gfeProblems, grandTotal, money } from "../lib/gfe/build";
import { sampleGfe, sampleGfeDue } from "../lib/gfe/demo";
import { renderGfePdf } from "../lib/gfe/pdf";

let text = "";
let pageCount = 0;

beforeAll(async () => {
  const bytes = await renderGfePdf(sampleGfe());
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  pageCount = doc.countPages();
  for (let i = 0; i < pageCount; i++) text += `${doc.loadPage(i).toStructuredText("preserve-whitespace").asText()}\n`;
  text = text.replace(/\s+/g, " ");
});

describe("sample GFE content", () => {
  it("is complete by our own checks", () => {
    expect(gfeProblems(sampleGfe())).toEqual([]);
  });

  it("totals 1 x $200 + 50 x $175 = $8,950", () => {
    expect(money(grandTotal(sampleGfe()))).toBe("$8,950.00");
  });

  it("is due Thu Oct 29 for a Nov 12 first visit booked Oct 26 (Dana open Mon-Thu)", () => {
    expect(sampleGfeDue().dueOn).toBe("2026-10-29");
  });

  it("refuses a recurring scope over 12 months, and a bad NPI", () => {
    const g = sampleGfe();
    expect(gfeProblems({ ...g, recurring: { ...g.recurring!, through: "2027-11-13" } })).toContainEqual(expect.stringContaining("12 months"));
    const bad = { ...g, estimates: [{ ...g.estimates[0], provider: { ...g.estimates[0].provider, npi: "1234567890" } }] };
    expect(gfeProblems(bad)).toContainEqual(expect.stringContaining("NPI"));
  });
});

describe("rendered PDF text, 45 CFR 149.610(c)(1)", () => {
  const has = (s: string) => expect(text).toContain(s);

  it("(i) patient name and date of birth", () => {
    has("Jordan Example [Sample]");
    has("01/01/1990");
  });
  it("(ii) primary service in plain language and its scheduled date", () => {
    has("Individual talk therapy");
    has("11/12/2026");
  });
  it("(iii)-(iv) itemized by provider, with codes and expected charges", () => {
    has("CPT 90791");
    has("CPT 90837");
    has("$200.00");
    has("$8,750.00");
    has("$8,950.00");
    has("Not yet determined; set after the first session");
  });
  it("(v) provider name, NPI, TIN, state and location", () => {
    has("Dana Reyes, LCPC (fictional demo practice)");
    has("1999999901 [Sample]");
    has("00-1234567 [Sample]");
    has("Chicago, IL 60614");
  });
  it("(vi) separately scheduled items with the disclaimer above the list", () => {
    const disclaimer = text.indexOf("expected to need separate scheduling");
    const list = text.indexOf("None expected");
    expect(disclaimer).toBeGreaterThan(-1);
    expect(list).toBeGreaterThan(disclaimer);
  });
  it("(viii)-(xi) disclaimers", () => {
    has("must be scheduled or requested separately"); // viii
    has("Actual items, services or charges may differ"); // ix
    has("at least $400 more"); // x
    has("within 120 calendar days");
    has("$25 fee");
    has("will not affect the quality of the health care");
    has("www.cms.gov/nosurprises");
    has("1-800-985-3059");
    has("is not a contract"); // xi
  });
  it("(b)(1)(x) recurring scope: frequency, count, 12-month limit", () => {
    has("once a week, 51 visits in total");
    has("valid for 12 months from the date of the Good Faith Estimate");
  });
  it("labels the fictional practice on every page and never shows a license number", () => {
    expect(text.split("[Sample] Fictional demo practice").length - 1).toBe(pageCount);
    expect(text).not.toMatch(/license (no|number|#)/i);
  });
});
