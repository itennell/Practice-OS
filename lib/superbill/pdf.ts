import { PDFDocument, StandardFonts } from "pdf-lib";
import type { CredentialingProfile } from "../credentialing/profile";
import { money } from "../gfe/build";
import { M, MUTED, W, Writer, formBox, signatureLine, usDate } from "../gfe/pdf";
import { CPT, POS } from "./codes";

const PLACE_KEY = Object.entries(POS).map(([code, label]) => `${code} ${label}`).join("; ");
import { lineTotal, type SuperbillRow } from "./store";

// Renders a superbill: the practice side filled in from her saved superbill and
// credentialing profile, the client side as blank fillable boxes (AcroForm text
// fields). She types the client's name, birth date, address and diagnosis codes
// into those boxes on her own computer; Practice-OS never sees them. Field order
// follows the CMS-1500 items each value feeds (docs/research.md).

export const CLIENT_FIELDS = [
  { name: "client_name", label: "Client name (item 2)" },
  { name: "client_dob", label: "Date of birth (item 3)" },
  { name: "client_address", label: "Street address (item 5)" },
  { name: "client_city_state_zip", label: "City, state, ZIP (item 5)" },
  { name: "client_member_id", label: "Insurance member ID (item 1a)" },
] as const;

export const DIAGNOSIS_FIELDS = (["A", "B", "C", "D"] as const).map((l) => ({ name: `diagnosis_${l}`, label: `Diagnosis ${l} (ICD-10-CM, item 21)` }));

/** The provider block needs her NPI and tax ID; they come from Credentialing. */
export class MissingProviderDetails extends Error {
  constructor() {
    super("Add your NPI and tax ID on Paperwork > Credentialing first. The superbill must show both.");
  }
}

export async function renderSuperbillPdf(sb: SuperbillRow, p: CredentialingProfile, preparedOn: string): Promise<Uint8Array> {
  if (!p.npi.number || !p.tin) throw new MissingProviderDetails();
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Superbill ${sb.reference}`);
  pdf.setSubject("Statement of services for insurance reimbursement");
  pdf.setProducer("Practice-OS");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const form = pdf.getForm();
  const w = new Writer(
    pdf,
    regular,
    await pdf.embedFont(StandardFonts.HelveticaBold),
    [sb.is_sample ? "[Sample] Fictional demo practice. Not a real superbill." : null, sb.reference].filter(Boolean).join(" "),
  );
  const demo = sb.is_sample ? " (fictional demo practice)" : "";
  const addr = p.practiceLocation.address;

  w.text(`${p.identity.practiceName}${demo}`, { size: 16, bold: true, gap: 2 });
  w.text("Superbill: statement of services for insurance reimbursement", { size: 13, gap: 2 });
  w.text(`Reference: ${sb.reference}   Prepared: ${usDate(preparedOn)}${sb.issued_on ? `   Given: ${usDate(sb.issued_on)}` : ""}`, { color: MUTED });
  if (sb.is_sample) w.text("[Sample] Every name, number and fee on this form is fake, for a fictional demo practice.", { size: 9, color: MUTED });

  w.heading("Client (filled in by the provider)");
  w.text("Aeon left these boxes blank on purpose. Type the client's details here before you give this to them.", { size: 9, color: MUTED });
  for (const f of CLIENT_FIELDS) formBox(w, form, f.name, f.label);

  w.heading("Diagnosis codes (filled in by the provider)");
  w.text("Each service line below points to these letters (CMS-1500 item 24E).", { size: 9, color: MUTED });
  for (const f of DIAGNOSIS_FIELDS) formBox(w, form, f.name, f.label);

  w.heading("Provider");
  w.field("Rendering provider", `${p.identity.name}, ${p.identity.credential}${demo}`);
  w.field("Practice (billing provider, item 33)", `${p.identity.practiceName}${demo}`);
  w.field("Address (items 32 and 33)", `${addr.street}, ${addr.city}, ${addr.state} ${addr.zip}`);
  w.field("Phone", p.practiceLocation.phone || p.identity.phone);
  w.field(`NPI, Type ${p.npi.type} (items 24J and 33a)`, `${p.npi.number}${sb.is_sample ? " [Sample]" : ""}`);
  w.field("Federal tax ID (item 25)", `${p.tin}${sb.is_sample ? " [Sample]" : ""}`);
  w.field("Specialty (taxonomy)", `${p.npi.taxonomyLabel} (${p.npi.taxonomy})`);

  w.heading("Services (item 24)");
  const cols: [number, number][] = [
    [M, 66],
    [M + 66, 120],
    [M + 186, 56],
    [M + 242, 40],
    [M + 282, 52],
    [M + 334, 66],
    [M + 400, 36],
    [M + 436, 68],
  ];
  w.row(["Date (24A)", "Service", "CPT (24D)", "Mod.", "Place (24B)", "Diagnosis (24E)", "Units (24G)", "Charge (24F)"], cols, true);
  for (const l of sb.lines) {
    w.row(
      [usDate(l.date_of_service), CPT[l.cpt].label, l.cpt, l.modifier ?? "", l.pos, l.dx_pointers.join(", "), String(l.units), money(lineTotal(l))],
      cols,
    );
  }
  w.text(`Place of service: ${PLACE_KEY}.`, { size: 8, color: MUTED });
  w.y -= 2;
  w.field("Total charges", money(sb.total_cents));
  w.field("Amount paid (item 29)", money(sb.paid_cents));
  w.field("Balance due", money(sb.total_cents - sb.paid_cents));

  w.heading("Provider signature");
  w.text("The provider reviews this statement, signs it and gives it to the client. Practice-OS prepares it and never signs or sends it.", {
    size: 9,
    color: MUTED,
  });
  signatureLine(w, "Provider signature");

  form.updateFieldAppearances(regular);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 30, size: 8, font: regular, color: MUTED }));
  return pdf.save();
}
