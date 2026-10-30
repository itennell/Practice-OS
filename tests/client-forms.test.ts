// The client forms library: every form type, rendered for the fictional demo
// practice, read back from the PDF's own text with mupdf, and checked element by
// element against its requirements (docs/research.md › Client forms).
import * as mupdf from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { checkText, readingGrade } from "../lib/client-forms/check";
import { practiceFacts } from "../lib/client-forms/facts";
import { POLICIES_MESSAGE, STATE_MESSAGE, formList, getForm, prepare, renderForm } from "../lib/client-forms";
import { plainText } from "../lib/client-forms/render";
import { ATTORNEY_LINE, DEFAULT_POLICIES, isCalendarDate, policiesSchema, type FormDef, type Policies } from "../lib/client-forms/types";

const FEES = [{ code: "90837", label: "Therapy, 53+ minutes", cents: 16000 }];
/** Every policy she sets, as if she had saved them once. */
const POLICIES: Policies = {
  ...DEFAULT_POLICIES,
  reply_within_hours: 48,
  backup_colleague: "Jordan Lee, LCSW [Sample]",
  accepts_insurance: false,
  texting_ok: true,
  npp_effective_on: "2026-11-01",
};
const facts = practiceFacts(DANA_PROFILE, FEES, POLICIES, "2026-10-29", true);

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

  it("matches the check on the template text before rendering, and is ready to download", () => {
    const p = prepare(def, facts);
    expect(p.check.missing).toEqual([]);
    expect(p.gaps).toEqual([]);
    expect(p.blockers).toEqual([]);
  });

  it("can't be downloaded before she has saved her policies, and assumes nothing about her practice", () => {
    const fresh = practiceFacts(DANA_PROFILE, FEES, {}, "2026-10-29");
    const p = prepare(def, fresh);
    expect(p.blockers).toContain(POLICIES_MESSAGE);
    for (const claim of [/free the first time/i, /We do not raise funds/i, /named in my professional will/i, /within 48 hours/i]) expect(p.text).not.toMatch(claim);
  });
});

const form = (id: Parameters<typeof getForm>[0]) => getForm(id)!;

describe("download gates", () => {
  it("blocks Illinois wording for a practice in another state, and says why", () => {
    const wi = practiceFacts({ ...DANA_PROFILE, practiceLocation: { ...DANA_PROFILE.practiceLocation, address: { ...DANA_PROFILE.practiceLocation.address, state: "WI" } } }, FEES, POLICIES, "2026-10-29", true);
    for (const id of ["informed_consent", "telehealth_consent", "minor_consent", "npp", "records_request"] as const) {
      const p = prepare(form(id), wi);
      expect(p.wrongState).toBe(true);
      expect(p.blockers).toContain(STATE_MESSAGE);
    }
    // A form with no Illinois wording still works anywhere.
    expect(prepare(form("phq9"), wi).blockers).toEqual([]);
  });

  it("with no fees set, does not claim fee disclosure is met", () => {
    const noFees = practiceFacts(DANA_PROFILE, [{ code: "90837", label: "Therapy", cents: 0 }], POLICIES, "2026-10-29", true);
    for (const id of ["practice_policies", "informed_consent"] as const) {
      const p = prepare(form(id), noFees);
      expect(p.check.ok).toBe(false);
      expect(p.gaps.length).toBeGreaterThan(0);
      expect(p.blockers.length).toBeGreaterThan(0);
    }
  });

  it("prints [fill in] for a policy she hasn't set, and blocks the download", () => {
    const p = prepare(form("informed_consent"), practiceFacts(DANA_PROFILE, FEES, { ...POLICIES, backup_colleague: "" }, "2026-10-29", true));
    expect(p.text).toContain("[fill in: the colleague");
    expect(p.blockers.some((b) => b.startsWith("Fill in"))).toBe(true);
  });
});

describe("minor consent (405 ILCS 5/3-550)", () => {
  const def = form("minor_consent");
  it("prints all four (a-1) factors and the (a)(2) rule", () => {
    const t = prepare(def, facts).text;
    expect(t).toMatch(/all four of these are true \(405 ILCS 5\/3-550\(a-1\)\)/);
    expect(t).toMatch(/our sessions must stop after the 8th session, and I will not tell your parent or guardian about your therapy \(405 ILCS 5\/3-550\(a\)\(2\)\)/);
    expect(t).toMatch(/do not object, or if I do not find compelling reasons to deny it \(740 ILCS 110\/4\(a\)\(3\)\)/);
  });

  it("prints the LMFT caveat only for an LMFT", () => {
    expect(prepare(def, facts).text).not.toMatch(/marriage and family therapist/);
    const lmft = practiceFacts({ ...DANA_PROFILE, identity: { ...DANA_PROFILE.identity, credential: "LMFT" } }, FEES, POLICIES, "2026-10-29", true);
    expect(prepare(def, lmft).text).toMatch(/does not name my license \(405 ILCS 5\/3-550\(c\)\)/);
  });
});

describe("couples no-secrets policy", () => {
  it("is fixed wording with each partner's written waiver", () => {
    const def = form("couples_family_consent");
    const secrets = def.build(facts).find((b) => b.kind === "clause" && b.id === "secrets");
    expect(secrets && secrets.kind === "clause" && secrets.editable).toBeFalsy();
    const p = prepare(def, facts, { clauses: { secrets: "I keep every secret." } });
    expect(p.text).not.toContain("I keep every secret.");
    expect(p.text).toMatch(/each adult's written permission/);
  });
});

describe("rendering", () => {
  it("draws a paragraph that has tabs and carriage returns in it", async () => {
    const def = form("practice_policies");
    const bytes = await renderForm(def, facts, { extra: "Office hours:\tMonday\tto Friday.\r\nCall first." });
    const { text } = await read(bytes);
    expect(text).toContain("Office hours: Monday to Friday.");
    expect(text).toContain("Call first.");
  });

  it("keeps the PHQ-9's em dashes, word for word", () => {
    expect(plainText(form("phq9"), facts, form("phq9").build(facts))).toContain("Feeling bad about yourself — or that you are a failure");
  });
});

describe("policies", () => {
  it("takes only a real calendar date for the privacy notice", () => {
    expect(isCalendarDate("2026-11-01")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("2026-13-01")).toBe(false);
    expect(policiesSchema.partial().safeParse({ npp_effective_on: "2026-02-31" }).success).toBe(false);
    expect(policiesSchema.partial().safeParse({ npp_effective_on: "2028-02-29" }).success).toBe(true);
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
