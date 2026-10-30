// The client forms library: every form type, rendered for the fictional demo
// practice, read back from the PDF's own text with mupdf, and checked element by
// element against its requirements (docs/research.md › Client forms).
import * as mupdf from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { checkText, readingGrade } from "../lib/client-forms/check";
import { practiceFacts } from "../lib/client-forms/facts";
import { formList, prepare, renderForm } from "../lib/client-forms";
import { ATTORNEY_LINE, type FormDef } from "../lib/client-forms/types";

const FEES = [{ code: "90837", label: "Therapy, 53+ minutes", cents: 16000 }];
const facts = practiceFacts(DANA_PROFILE, FEES, {}, "2026-10-29");

async function read(bytes: Uint8Array) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
  let text = "";
  const widgets: Record<string, string> = {};
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as mupdf.PDFPage;
    text += `${page.toStructuredText("preserve-whitespace").asText()}\n`;
    for (const wd of page.getWidgets()) widgets[wd.getName()] = wd.getValue();
  }
  return { text: text.replace(/\s+/g, " "), widgets, pages: doc.countPages() };
}

const pdfs = new Map<string, Awaited<ReturnType<typeof read>>>();
beforeAll(async () => {
  for (const def of formList()) pdfs.set(def.id, await read(await renderForm(def, facts)));
});

describe.each(formList().map((d) => [d.id, d] as [string, FormDef]))("%s", (id, def) => {
  it("says every required element, in the PDF itself", () => {
    const r = checkText(def, pdfs.get(id)!.text);
    expect(r.missing).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it("carries the attorney-review line and the fictional-practice label", () => {
    const { text } = pdfs.get(id)!;
    expect(text).toContain(ATTORNEY_LINE);
    expect(text).toContain("Reyes Counseling PLLC (fictional demo practice)");
  });

  it("leaves every client box empty", () => {
    expect(Object.values(pdfs.get(id)!.widgets).filter((v) => v && v !== "Off")).toEqual([]);
  });

  it("fails the check when a required element is taken out", () => {
    const text = pdfs.get(id)!.text;
    for (const e of def.elements) {
      let cut = text;
      for (const re of e.mustSay) cut = cut.replace(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`), "");
      expect(checkText(def, cut).missing.map((m) => m.id)).toContain(e.id);
    }
  });

  it("refuses her edit when it replaces the clause that carries a required element", () => {
    const ids = new Set(def.elements.map((e) => e.id));
    for (const b of def.build(facts)) {
      if (b.kind !== "clause" || !b.editable || !ids.has(b.id)) continue;
      const { check } = prepare(def, facts, { clauses: { [b.id]: "Please call me." } });
      expect(check.missing.map((m) => m.id)).toContain(b.id);
    }
  });

  it("reads at about an 8th-grade level (never above grade 10)", () => {
    expect(prepare(def, facts).check.grade).toBeLessThanOrEqual(10);
  });

  it("matches the check on the template text before rendering", () => {
    expect(prepare(def, facts).check.missing).toEqual([]);
  });
});

describe("reading level", () => {
  it("scores plain sentences low and dense ones high", () => {
    expect(readingGrade("You can stop at any time. Just tell us. We will help you find someone else.")).toBeLessThan(5);
    expect(
      readingGrade("Notwithstanding the aforementioned considerations, the undersigned acknowledges comprehensive responsibility for remuneration of professional services."),
    ).toBeGreaterThan(14);
  });
});
