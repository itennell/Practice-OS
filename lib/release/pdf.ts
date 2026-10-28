import { PDFDocument, StandardFonts } from "pdf-lib";
import type { CredentialingProfile } from "../credentialing/profile";
import { M, MUTED, W, Writer, formBox, signatureLine, usDate } from "../gfe/pdf";
import type { ReleaseFields } from "./fields";

// The Illinois consent to release mental health information (740 ILCS 110/5),
// also meeting the HIPAA authorization elements (45 CFR 164.508(c)). Every
// required element and the section it comes from: docs/research.md. The
// practice side comes from her profile; the client's boxes are always blank
// fillable fields she completes on her own computer. Aeon never signs.

export const STATEMENTS = {
  inspect: "You have the right to inspect and copy the information to be released (740 ILCS 110/5(b)(4)).",
  refusal:
    "You don't have to sign this form. Your treatment, payment, enrollment or eligibility for benefits will not depend on whether you sign it. " +
    "If you refuse, the only consequence is that this information will not be released (740 ILCS 110/5(b)(5); 45 CFR 164.508(c)(2)(ii)).",
  expiry:
    "This consent ends on the calendar date written above. If no date is written, Illinois law lets it be used only on the day the therapist receives it (740 ILCS 110/5(b)(6)).",
  revoke:
    "You may revoke this consent at any time by giving the practice a written revocation that you sign (a revocation form is available). " +
    "It takes effect when the practice receives it and does not undo releases made before then (740 ILCS 110/5(b), (b)(7) and (c); 45 CFR 164.508(c)(2)(i)).",
  redisclosureIl:
    "Under Illinois law, the person or agency that receives this information may not disclose it to anyone else unless you specifically consent to that (740 ILCS 110/5(d)).",
  redisclosureHipaa:
    "Federal law also requires us to tell you that information released under this form could be redisclosed by the recipient and would then no longer be protected by the federal privacy rule (45 CFR 164.508(c)(2)(iii)).",
  copy: "You will get a copy of this form after you sign it (45 CFR 164.508(c)(4)).",
  whoSigns:
    "Who signs (740 ILCS 110/4): a client 12 or older signs for themselves. For a client under 12, a parent or guardian signs. " +
    "For a client 12 to 17, the client and a parent or guardian both sign. A personal representative signs with a description of their authority.",
  forProvider:
    "For the provider: keep a copy of this consent in the client's record and note any release made under it (740 ILCS 110/5(b)). Practice-OS keeps no copy.",
} as const;

export const RELEASE_FIELDS = [
  "client_name",
  "client_dob",
  "recipient",
  "recipient_address",
  "purpose",
  "information",
  "expires_on",
  "representative_name",
  "representative_authority",
] as const;

function header(w: Writer, p: CredentialingProfile, title: string, isSample: boolean) {
  const demo = isSample ? " (fictional demo practice)" : "";
  const a = p.practiceLocation.address;
  w.text(`${p.identity.practiceName}${demo}`, { size: 16, bold: true, gap: 2 });
  w.text(title, { size: 13, gap: 2 });
  w.text(`${a.street}, ${a.city}, ${a.state} ${a.zip} · ${p.practiceLocation.phone || p.identity.phone}`, { color: MUTED, gap: 2 });
  if (isSample) w.text("[Sample] Every name and number on this form is fake, for a fictional demo practice.", { size: 9, color: MUTED });
}

async function newDoc(title: string, footer: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("Practice-OS");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const w = new Writer(pdf, regular, await pdf.embedFont(StandardFonts.HelveticaBold), footer);
  return { pdf, w, form: pdf.getForm(), regular };
}

async function finish(pdf: PDFDocument, w: Writer) {
  pdf.getForm().updateFieldAppearances(w.regular);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 30, size: 8, font: w.regular, color: MUTED }));
  return pdf.save();
}

/** `fields` null = the blank form; otherwise the boxes Aeon or she filled (never the client's). */
export async function renderReleaseForm(fields: ReleaseFields | null, p: CredentialingProfile, isSample: boolean): Promise<Uint8Array> {
  const footer = `${isSample ? "[Sample] Fictional demo practice. " : ""}Consent to release information (740 ILCS 110/5)`;
  const { pdf, w, form } = await newDoc("Consent to release mental health information", footer);
  const demo = isSample ? " (fictional demo practice)" : "";
  header(w, p, "Consent to Release Mental Health Information", isSample);
  w.text("Illinois Mental Health and Developmental Disabilities Confidentiality Act (740 ILCS 110/5) and HIPAA (45 CFR 164.508)", {
    size: 9,
    color: MUTED,
  });

  w.heading("Client");
  formBox(w, form, "client_name", "Client name");
  formBox(w, form, "client_dob", "Client date of birth");

  w.heading("Who may release the information");
  w.field("Therapist", `${p.identity.name}, ${p.identity.credential}${demo}`);
  w.field("Practice", `${p.identity.practiceName}${demo}`);

  w.heading("The release");
  formBox(w, form, "recipient", "Release to (person or agency)", { value: fields?.recipient });
  formBox(w, form, "recipient_address", "Their address, phone or fax", { value: fields?.recipient_address });
  formBox(w, form, "purpose", "Purpose of the release", { value: fields?.purpose, lines: 2 });
  formBox(w, form, "information", "Exactly what to release (no blanket releases, 110/5(c))", { value: fields?.information, lines: 3 });
  formBox(w, form, "expires_on", "This consent expires on (calendar date, required)", { value: fields ? usDate(fields.expires_on) : undefined });

  w.heading("Your rights");
  for (const key of ["inspect", "refusal", "expiry", "revoke", "redisclosureIl", "redisclosureHipaa", "copy"] as const) w.text(STATEMENTS[key], { size: 9.5 });

  w.heading("Signatures");
  w.text(STATEMENTS.whoSigns, { size: 9, color: MUTED });
  signatureLine(w, "Signature of client (age 12 or older)");
  signatureLine(w, "Signature of parent or guardian (client under 18)");
  w.y -= 6;
  formBox(w, form, "representative_name", "Personal representative's name (if any)");
  formBox(w, form, "representative_authority", "Their authority to act for the client (e.g. guardian, power of attorney)", { lines: 2 });
  signatureLine(w, "Signature of personal representative");
  signatureLine(w, "Witness (optional): I checked the signer's identity");

  w.y -= 6;
  w.text(STATEMENTS.forProvider, { size: 9, color: MUTED });
  return finish(pdf, w);
}

/** The written, signed revocation 110/5(b) requires. Always blank. */
export async function renderRevocationForm(p: CredentialingProfile, isSample: boolean): Promise<Uint8Array> {
  const footer = `${isSample ? "[Sample] Fictional demo practice. " : ""}Revocation of consent (740 ILCS 110/5)`;
  const { pdf, w, form } = await newDoc("Revocation of consent to release information", footer);
  header(w, p, "Revocation of Consent to Release Information", isSample);

  w.heading("Client");
  formBox(w, form, "client_name", "Client name");
  formBox(w, form, "client_dob", "Client date of birth");

  w.heading("The consent you are revoking");
  formBox(w, form, "consent_dated", "Date of the consent");
  formBox(w, form, "recipient", "It allowed release to");
  w.text(
    "I revoke this consent. It stops when the practice receives this signed revocation. Releases made before then are not undone (740 ILCS 110/5(b) and (c)).",
    { size: 9.5 },
  );

  w.heading("Signature");
  signatureLine(w, "Signature of the person who gave the consent");
  formBox(w, form, "signer_name", "Printed name, and relationship to the client if not the client");
  w.y -= 6;
  w.text("For the provider: note the date received in the client's record. Practice-OS keeps no copy.", { size: 9, color: MUTED });
  return finish(pdf, w);
}
