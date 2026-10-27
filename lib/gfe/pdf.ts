import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { addMonths } from "../compliance/dates";
import { assertComplete, grandTotal, lineTotal, money, providerTotal } from "./build";
import { DISCLAIMERS, separateSchedulingDisclaimer } from "./disclaimers";
import { DIAGNOSIS_NOT_YET, type GoodFaithEstimate } from "./types";

// Renders a Good Faith Estimate as a letter-size PDF with real, selectable text
// (so the client can save, print and search it, 149.610(e)(1)). Layout follows
// the CMS standard form: patient, primary service, summary, each provider's
// itemized estimate, then the disclaimers.

const INK = rgb(0.09, 0.08, 0.17);
const MUTED = rgb(0.36, 0.35, 0.47);
const LINE = rgb(0.83, 0.8, 0.94);
const ACCENT = rgb(0.36, 0.28, 0.79);
const W = 612;
const H = 792;
const M = 54;

function usDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

class Writer {
  page!: PDFPage;
  y = 0;
  constructor(
    private pdf: PDFDocument,
    readonly regular: PDFFont,
    readonly bold: PDFFont,
    private footer: string,
  ) {
    this.newPage();
  }

  newPage() {
    this.page = this.pdf.addPage([W, H]);
    this.y = H - M;
    this.page.drawText(this.footer, { x: M, y: 30, size: 8, font: this.regular, color: MUTED });
  }

  ensure(space: number) {
    if (this.y - space < M) this.newPage();
  }

  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const para of text.split("\n")) {
      let line = "";
      for (const word of para.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = word;
        } else line = next;
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; width?: number; gap?: number } = {}) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.regular;
    const x = opts.x ?? M;
    const lines = this.wrap(text, font, size, opts.width ?? W - M - x);
    for (const line of lines) {
      this.ensure(size + 4);
      this.y -= size + 3;
      this.page.drawText(line, { x, y: this.y, size, font, color: opts.color ?? INK });
    }
    this.y -= opts.gap ?? 4;
  }

  heading(text: string) {
    this.ensure(40);
    this.y -= 10;
    this.text(text, { size: 13, bold: true, color: ACCENT, gap: 2 });
    this.page.drawLine({ start: { x: M, y: this.y }, end: { x: W - M, y: this.y }, thickness: 0.6, color: LINE });
    this.y -= 8;
  }

  field(label: string, value: string) {
    const labelWidth = 170;
    const labels = this.wrap(label, this.bold, 10, labelWidth - 10);
    const values = this.wrap(value, this.regular, 10, W - 2 * M - labelWidth);
    const rows = Math.max(labels.length, values.length);
    this.ensure(rows * 13 + 4);
    labels.forEach((l, i) => this.page.drawText(l, { x: M, y: this.y - 13 * (i + 1), size: 10, font: this.bold, color: INK }));
    values.forEach((v, i) =>
      this.page.drawText(v, { x: M + labelWidth, y: this.y - 13 * (i + 1), size: 10, font: this.regular, color: INK }),
    );
    this.y -= rows * 13 + 3;
  }

  /** A table row; columns are [x, width]. */
  row(cells: string[], cols: [number, number][], bold = false) {
    const font = bold ? this.bold : this.regular;
    const wrapped = cells.map((c, i) => this.wrap(c, font, 9, cols[i][1] - 6));
    const height = Math.max(...wrapped.map((w) => w.length)) * 12 + 6;
    this.ensure(height);
    wrapped.forEach((lines, i) =>
      lines.forEach((line, j) =>
        this.page.drawText(line, { x: cols[i][0], y: this.y - 12 - j * 12, size: 9, font, color: INK }),
      ),
    );
    this.y -= height;
    this.page.drawLine({ start: { x: M, y: this.y + 2 }, end: { x: W - M, y: this.y + 2 }, thickness: 0.4, color: LINE });
  }
}

export async function renderGfePdf(g: GoodFaithEstimate): Promise<Uint8Array> {
  assertComplete(g);
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Good Faith Estimate - ${g.patient.firstName} ${g.patient.lastName}`);
  pdf.setSubject("Good Faith Estimate under the No Surprises Act (45 CFR 149.610)");
  pdf.setProducer("Practice-OS");
  const w = new Writer(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
    g.isSample
      ? "[Sample] Fictional demo practice. Not a real estimate."
      : `Good Faith Estimate of ${usDate(g.issuedOn)} for ${g.patient.firstName} ${g.patient.lastName}`,
  );

  // Header
  w.text(g.convener, { size: 16, bold: true, gap: 2 });
  w.text("Good Faith Estimate for Health Care Items and Services", { size: 13, gap: 2 });
  w.text(`Date of Good Faith Estimate: ${usDate(g.issuedOn)}`, { color: MUTED, gap: 2 });
  if (g.isSample) w.text("[Sample] Every name, number and fee on this form is fake, for a fictional demo practice.", { size: 9, color: MUTED });

  // Patient, (c)(1)(i)
  const p = g.patient;
  w.heading("Patient");
  w.field("Patient name", [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" "));
  w.field("Patient date of birth", usDate(p.dob));
  w.field("Mailing address", `${p.address.street}${p.address.apartment ? `, ${p.address.apartment}` : ""}, ${p.address.city}, ${p.address.state} ${p.address.zip}`);
  w.field("Phone", p.phone);
  w.field("Email address", p.email);
  w.field("Contact preference", p.contactPreference === "email" ? "By email" : "By mail");

  // Primary service and diagnosis, (c)(1)(ii) and (iv)
  w.heading("Primary Service or Item Requested/Scheduled");
  w.text(g.primaryService.description);
  w.field(
    "Scheduled date(s)",
    g.primaryService.scheduledDates.length ? g.primaryService.scheduledDates.map(usDate).join(", ") : "Not yet scheduled",
  );
  w.field("Patient primary diagnosis", g.diagnosis.primary ?? DIAGNOSIS_NOT_YET);
  w.field("Primary diagnosis code", g.diagnosis.primary ? g.diagnosis.primary : DIAGNOSIS_NOT_YET);
  if (g.diagnosis.secondary) w.field("Patient secondary diagnosis", g.diagnosis.secondary);

  // Summary of expected charges
  w.heading("Summary of Expected Charges");
  w.text("See the itemized estimate below for more detail.", { color: MUTED });
  for (const e of g.estimates) w.field(e.provider.name, `Estimated total cost: ${money(providerTotal(e))}`);
  w.field("Total estimated cost", money(grandTotal(g)));
  const r = g.recurring;
  const dates = g.primaryService.scheduledDates.length ? g.primaryService.scheduledDates.map(usDate).join(", ") : "a date not yet scheduled";
  w.text(`The following is a detailed list of expected charges for ${g.primaryService.description.replace(/\.$/, "")}, scheduled for ${dates}.`);
  if (r) {
    w.text(
      `These are recurring services: ${r.frequency.toLowerCase()}, ${r.totalVisits} visits in total, from ${usDate(r.from)} through ${usDate(r.through)}. ` +
        `The estimated costs are valid for 12 months from the date of the Good Faith Estimate (through ${usDate(addMonths(g.issuedOn, 12))}). ` +
        "If care continues after that, you will get a new Good Faith Estimate.",
    );
  }

  // Each provider, (c)(1)(iii)-(v)
  g.estimates.forEach((e, i) => {
    const pr = e.provider;
    w.heading(`Provider ${i + 1} Estimate`);
    w.field("Provider name", pr.name);
    w.field("Provider type", pr.type);
    w.field("Address", `${pr.address.street}, ${pr.address.city}, ${pr.address.state} ${pr.address.zip}`);
    w.field("Contact person", pr.contact.person);
    w.field("Phone / email", `${pr.contact.phone} / ${pr.contact.email}`);
    w.field("National Provider Identifier", `${pr.npi}${g.isSample ? " [Sample]" : ""}`);
    w.field("Taxpayer Identification Number", `${pr.tin}${g.isSample ? " [Sample]" : ""}`);
    w.y -= 6;
    w.ensure(110); // keep the table title, header and first row together
    w.text(`Details of Services and Items for ${pr.name}`, { bold: true });
    const cols: [number, number][] = [
      [M, 130],
      [M + 130, 140],
      [M + 270, 70],
      [M + 340, 70],
      [M + 410, 40],
      [M + 450, 54],
    ];
    w.row(["Service/Item", "Address where provided", "Diagnosis code", "Service code", "Qty", "Expected cost"], cols, true);
    for (const l of e.lines) {
      w.row(
        [
          `${l.service} (${money(l.unitCharge)} each)`,
          l.location,
          l.diagnosisCode ?? "Not yet determined",
          `${l.serviceCode.type} ${l.serviceCode.number}`,
          String(l.quantity),
          money(lineTotal(l)),
        ],
        cols,
      );
    }
    w.y -= 4;
    w.field(`Total expected charges from ${pr.name}`, money(providerTotal(e)));
    if (e.notes) w.field("Additional provider notes", e.notes);
  });

  // Separately scheduled items, with the required disclaimer directly above, (c)(1)(vi)
  w.heading("Items or Services Scheduled Separately");
  for (const para of separateSchedulingDisclaimer(g.howToRequest).paragraphs) w.text(para);
  w.field("Listed items", g.separatelyScheduled.length ? g.separatelyScheduled.join("; ") : "None expected");
  w.field("Total estimated cost for all services and items", money(grandTotal(g)));

  // Disclaimers, (c)(1)(viii)-(xi)
  w.heading("Disclaimer");
  for (const d of DISCLAIMERS) {
    if (d.heading && d.heading !== "Disclaimer") w.text(d.heading, { bold: true });
    for (const para of d.paragraphs) w.text(para);
  }

  // Page numbers
  const pages = pdf.getPages();
  pages.forEach((pg, i) =>
    pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 30, size: 8, font: w.regular, color: MUTED }),
  );

  return pdf.save();
}
