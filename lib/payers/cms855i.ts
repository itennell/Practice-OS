import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFCheckBox, PDFDocument, PDFTextField, StandardFonts, degrees, rgb } from "pdf-lib";
import type { CredentialingProfile } from "../credentialing/profile";

// Fills Medicare's CMS-855I (enrollment for physicians and non-physician
// practitioners, version 05/23, the one CMS still posts) from her credentialing
// profile. Field names are the form's own (e.g. "5-13"); each was matched to the
// printed label beside it. Aeon fills what the profile holds and leaves the rest
// for her: her SSN, date of birth and license number (never stored), the yes/no
// legal questions, payment details, and the certification and signature.

export const CMS855I_VERSION = "05/23";
export const CMS855I_SOURCE = "https://www.cms.gov/medicare/cms-forms/cms-forms/cms-forms-items/cms019477";
/** CMS FAQ, May 2024: MFTs and MHCs check "Undefined Non-Physician Practitioner Specialty" in 2H and write in MFT or MHC. */
export const MFT_MHC_FAQ = "https://www.cms.gov/files/document/marriage-and-family-therapists-and-mental-health-counselors-faq.pdf";

function formBytes(): Uint8Array {
  const candidates = [
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "forms", "cms855i-05-23.pdf"),
    path.join(process.cwd(), "lib", "forms", "cms855i-05-23.pdf"),
  ];
  for (const file of candidates) {
    try {
      return readFileSync(file);
    } catch {
      // try the next place
    }
  }
  throw new Error("The CMS-855I form file is missing (lib/forms/cms855i-05-23.pdf).");
}

/** Section 2H specialty: LCSW has its own box; counselors and MFTs use the write-in (CMS FAQ, May 2024). */
export function specialtyFor(credential: string): { checkbox: string; writeIn?: string; label: string } | null {
  const c = credential.toUpperCase().replace(/[^A-Z]/g, "");
  if (c === "LCSW") return { checkbox: "CheckBox32", label: "Clinical Social Worker" };
  if (c.includes("PSYCHOLOGIST") || c === "PHD" || c === "PSYD") return { checkbox: "CheckBox38", label: "Psychologist, Clinical" };
  if (["LCPC", "LPC", "LPCC", "LMHC", "LCMHC"].includes(c)) {
    return { checkbox: "CheckBox43", writeIn: "Mental Health Counselor (MHC)", label: "Undefined Non-Physician Practitioner Specialty: MHC" };
  }
  if (["LMFT", "MFT", "LCMFT"].includes(c)) {
    return { checkbox: "CheckBox43", writeIn: "Marriage and Family Therapist (MFT)", label: "Undefined Non-Physician Practitioner Specialty: MFT" };
  }
  return null;
}

/** "2400 N Example Ave, Suite 2" -> line 1 and line 2. */
function splitStreet(street: string): [string, string] {
  const m = street.match(/^(.*?),\s*((?:suite|ste|unit|apt|room|#|floor|fl)\b.*)$/i);
  return m ? [m[1].trim(), m[2].trim()] : [street, ""];
}

type Entry = { field: string; label: string; value: string | true };

/** What Aeon fills, as [form field, plain label, value]. Pure, so it can be tested without a PDF. */
export function cms855iEntries(p: CredentialingProfile): Entry[] {
  const [first, ...rest] = p.identity.name.trim().split(/\s+/);
  const last = rest.join(" ");
  const [street1, street2] = splitStreet(p.practiceLocation.address.street);
  const a = p.practiceLocation.address;
  const school = p.education[0];
  const spec = specialtyFor(p.identity.credential);
  const e: (Entry | false | null | undefined | "")[] = [
    first && { field: "5-1", label: "2A First name", value: first },
    last && { field: "5-3", label: "2A Last name", value: last },
    p.npi.number && p.npi.type === 1 && { field: "5-13", label: "2A NPI (Type 1)", value: p.npi.number },
    school && { field: "5-14", label: "2B Professional school", value: school.school.replace(/\s*\[Sample\]/, "") },
    school && { field: "5-15", label: "2B Year of graduation", value: String(school.graduated) },
    p.license.state && { field: "CheckBox5-4", label: "2B Active license", value: true },
    p.license.state && { field: "5-18", label: "2B State where issued", value: p.license.state },
    a.street && { field: "6-3", label: "2D Mailing address line 1", value: street1 },
    street2 && { field: "6-4", label: "2D Mailing address line 2", value: street2 },
    a.city && { field: "6-5", label: "2D City", value: a.city },
    a.state && { field: "6-6", label: "2D State", value: a.state },
    a.zip && { field: "6-7", label: "2D ZIP", value: a.zip },
    p.identity.phone && { field: "6-8", label: "2D Telephone", value: p.identity.phone },
    p.identity.email && { field: "6-10", label: "2D Email", value: p.identity.email },
    spec && { field: spec.checkbox, label: `2H Specialty: ${spec.label}`, value: true },
    spec?.writeIn && { field: "8-1", label: "2H Specialty (specify)", value: spec.writeIn },
    p.identity.practiceName && { field: "11-1", label: "4A Legal business name", value: p.identity.practiceName },
    p.tin && { field: "11-2", label: "4A Tax identification number", value: p.tin },
    // 12-1 (EIN) belongs to the sole-proprietor payment choice in 4A3: hers to make, so left blank.
    p.practiceLocation.name && { field: "12-3", label: "4B Practice location name", value: p.practiceLocation.name },
    a.street && { field: "12-4", label: "4B Practice street line 1", value: street1 },
    street2 && { field: "12-5", label: "4B Practice street line 2", value: street2 },
    a.city && { field: "12-6", label: "4B City", value: a.city },
    a.state && { field: "12-7", label: "4B State", value: a.state },
    a.zip && { field: "12-8", label: "4B ZIP", value: a.zip },
    p.practiceLocation.phone && { field: "12-9", label: "4B Telephone", value: p.practiceLocation.phone },
    p.identity.email && { field: "12-11", label: "4B Email", value: p.identity.email },
  ];
  return e.filter((x): x is Entry => Boolean(x));
}

/** What only she can complete, in the form's order. */
export const LEFT_FOR_YOU = [
  "Section 1: why you're applying (new enrollment, revalidation, change).",
  "Section 2A: your Social Security number and date of birth. Aeon doesn't store them.",
  "Section 2B: your license number and its effective date. Aeon doesn't store license numbers.",
  "Section 3: the final adverse legal action questions. Only you can answer them.",
  "Section 4A: how your practice is organized and whether payments go to your SSN or your EIN.",
  "Payments: Medicare pays by direct deposit. Include the CMS-588 EFT form with your bank details.",
  "Section 12: the supporting documents CMS asks for.",
  "Section 15: the certification statement and your signature. Only you can sign.",
];

export type FilledForm = { bytes: Uint8Array; filled: { label: string; value: string }[]; leftForYou: string[]; skipped: string[] };

/**
 * Fills the form, keeping every field editable so she can finish it in any PDF
 * reader. A sample profile gets a "[Sample] not for submission" mark on every page.
 * Never touches the signature fields.
 */
export async function fillCms855i(p: CredentialingProfile): Promise<FilledForm> {
  const pdf = await PDFDocument.load(formBytes());
  const form = pdf.getForm();
  const filled: FilledForm["filled"] = [];
  const skipped: string[] = [];
  for (const e of cms855iEntries(p)) {
    try {
      const f = form.getField(e.field);
      if (f instanceof PDFCheckBox && e.value === true) f.check();
      else if (f instanceof PDFTextField && typeof e.value === "string") {
        const max = f.getMaxLength();
        if (max !== undefined && e.value.length > max) throw new Error("too long");
        f.setText(e.value);
      } else throw new Error("wrong field type");
      filled.push({ label: e.label, value: e.value === true ? "checked" : e.value });
    } catch {
      skipped.push(e.label);
    }
  }
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  form.updateFieldAppearances(await pdf.embedFont(StandardFonts.Helvetica));
  const pages = pdf.getPages();
  pages[0].drawText("Prepared by Aeon from your credentialing profile. Check every field. You sign and submit.", {
    x: 36,
    y: pages[0].getHeight() - 20,
    size: 8,
    font,
    color: rgb(0.36, 0.28, 0.79),
  });
  if (p.isSample) {
    for (const page of pages) {
      page.drawText("[SAMPLE] NOT FOR SUBMISSION", { x: 90, y: 300, size: 36, font, color: rgb(0.85, 0.2, 0.15), opacity: 0.18, rotate: degrees(35) });
    }
  }
  pdf.setTitle(`CMS-855I prepared for ${p.identity.name}`);
  return { bytes: await pdf.save(), filled, leftForYou: LEFT_FOR_YOU, skipped };
}
