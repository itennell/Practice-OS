// The Illinois release form (740 ILCS 110/5 + 45 CFR 164.508), read back with
// mupdf and checked element by element against docs/research.md.
import * as mupdf from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import { getReleaseDraft, putReleaseDraft } from "../lib/release/drafts";
import { checkReleaseFields, isBlanket } from "../lib/release/fields";
import { RELEASE_FIELDS, renderReleaseForm, renderRevocationForm, STATEMENTS } from "../lib/release/pdf";

const FILLED = {
  recipient: "Dr. Lee, Northside Clinic [Sample]",
  purpose: "Coordinate care with the primary care doctor",
  information: "Dates of attendance and a one-page treatment summary",
  expires_on: "2027-06-30",
};

async function read(bytes: Uint8Array) {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf") as mupdf.PDFDocument;
  let text = "";
  const widgets: Record<string, string> = {};
  for (let i = 0; i < doc.countPages(); i++) {
    const page = doc.loadPage(i) as mupdf.PDFPage;
    text += `${page.toStructuredText("preserve-whitespace").asText()}\n`;
    for (const wd of page.getWidgets()) widgets[wd.getName()] = wd.getValue();
  }
  return { text: text.replace(/\s+/g, " "), widgets };
}

let blank: Awaited<ReturnType<typeof read>>;
let filled: Awaited<ReturnType<typeof read>>;
let revocation: Awaited<ReturnType<typeof read>>;

beforeAll(async () => {
  blank = await read(await renderReleaseForm(null, DANA_PROFILE, true));
  filled = await read(await renderReleaseForm(checkReleaseFields(FILLED, "2026-10-27"), DANA_PROFILE, true));
  revocation = await read(await renderRevocationForm(DANA_PROFILE, true));
});

describe("release form fields", () => {
  it("refuses to fill a form without a calendar expiration date (110/5(b)(6))", () => {
    const noDate: Partial<typeof FILLED> = { ...FILLED };
    delete noDate.expires_on;
    expect(() => checkReleaseFields(noDate, "2026-10-27")).toThrow(/calendar date/);
    expect(() => checkReleaseFields({ ...FILLED, expires_on: "when treatment ends" }, "2026-10-27")).toThrow();
    expect(() => checkReleaseFields({ ...FILLED, expires_on: "2026-10-27" }, "2026-10-27")).toThrow(/after today/);
  });

  it("refuses a blanket release (110/5(c)) and allows a specific one", () => {
    for (const bad of ["All records", "any and all information", "the entire chart", "complete medical records", "the whole chart"]) {
      expect(isBlanket(bad), bad).toBe(true);
      expect(() => checkReleaseFields({ ...FILLED, information: bad }, "2026-10-27")).toThrow(/blanket/);
    }
    expect(isBlanket(FILLED.information)).toBe(false);
  });

  it("has nowhere to put the client: strict schema refuses a name or birth date", () => {
    expect(() => checkReleaseFields({ ...FILLED, client_name: "Jordan Example" }, "2026-10-27")).toThrow();
    expect(() => checkReleaseFields({ ...FILLED, client_dob: "1990-01-01" }, "2026-10-27")).toThrow();
  });

  it("drafts live in memory for 30 minutes only", () => {
    const fields = checkReleaseFields(FILLED, "2026-10-27");
    const id = putReleaseDraft(fields, 0);
    expect(getReleaseDraft(id, 29 * 60_000)).toEqual(fields);
    expect(getReleaseDraft(id, 31 * 60_000)).toBeNull();
    expect(getReleaseDraft("nope")).toBeNull();
  });
});

describe("release form PDF, read back", () => {
  it("states every required element, word for word (docs/research.md)", () => {
    for (const s of Object.values(STATEMENTS)) expect(blank.text).toContain(s.replace(/\s+/g, " "));
    for (const label of [
      "Release to (person or agency)",
      "Purpose of the release",
      "Exactly what to release (no blanket releases, 110/5(c))",
      "This consent expires on (calendar date, required)",
      "Signature of client (age 12 or older)",
      "Signature of parent or guardian (client under 18)",
      "Their authority to act for the client",
      "Witness (optional)",
    ]) {
      expect(blank.text).toContain(label);
    }
  });

  it("names who may release it from her profile (164.508(c)(1)(ii))", () => {
    expect(blank.text).toContain("Dana Reyes, LCPC (fictional demo practice)");
    expect(blank.text).toContain("Reyes Counseling PLLC (fictional demo practice)");
    expect(blank.text).toContain("[Sample]");
  });

  it("the blank form has every box empty and fillable", () => {
    expect(Object.keys(blank.widgets).sort()).toEqual([...RELEASE_FIELDS].sort());
    for (const v of Object.values(blank.widgets)) expect(v).toBe("");
  });

  it("the filled form fills only the release boxes; the client's stay blank", () => {
    expect(filled.widgets).toMatchObject({
      recipient: FILLED.recipient,
      purpose: FILLED.purpose,
      information: FILLED.information,
      expires_on: "06/30/2027",
      client_name: "",
      client_dob: "",
      representative_name: "",
    });
  });

  it("the revocation form is written and signed, and undoes nothing already released", () => {
    expect(revocation.text).toContain("Revocation of Consent to Release Information");
    expect(revocation.text).toContain("Releases made before then are not undone");
    expect(revocation.text).toContain("Signature of the person who gave the consent");
    for (const v of Object.values(revocation.widgets)) expect(v).toBe("");
  });
});
