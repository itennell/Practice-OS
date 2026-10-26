import { mkdir, writeFile } from "node:fs/promises";
import * as mupdf from "mupdf";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

// A one-page fake intake form for the fictional demo practice. Every value is [Sample].
export const SAMPLE_CLIENT_NAME = "Jordan Example";

const FIELDS: Array<[string, string]> = [
  ["Client name", `${SAMPLE_CLIENT_NAME} [Sample]`],
  ["Date of birth", "01/01/1990 [Sample]"],
  ["Phone", "312-555-0100 [Sample]"],
  ["Email", "jordan@example.com [Sample]"],
  ["Preferred session time", "Weekday evenings [Sample]"],
  ["Session type", "Telehealth [Sample]"],
  ["Payment", "Self-pay, superbill requested [Sample]"],
  ["How did you hear about us?", "Referral from a primary care office [Sample]"],
];

export async function makeSamplePdf(dir = "test") {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.08, 0.17);

  page.drawText("Reyes Counseling PLLC (fictional demo practice)", { x: 56, y: 720, size: 16, font: bold, color: ink });
  page.drawText("New Client Intake Form [Sample]", { x: 56, y: 696, size: 13, font: regular, color: ink });
  page.drawText("All information on this form is fake and for testing only.", {
    x: 56, y: 676, size: 10, font: regular, color: rgb(0.36, 0.35, 0.47),
  });

  let y = 630;
  for (const [label, value] of FIELDS) {
    page.drawText(`${label}:`, { x: 56, y, size: 11, font: bold, color: ink });
    page.drawText(value, { x: 240, y, size: 11, font: regular, color: ink });
    page.drawLine({ start: { x: 56, y: y - 8 }, end: { x: 556, y: y - 8 }, thickness: 0.5, color: rgb(0.83, 0.8, 0.94) });
    y -= 36;
  }

  const pdfBytes = Buffer.from(await pdf.save());
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/sample.pdf`, pdfBytes);

  // Render page 1 at 2x for the PNG fallback.
  const doc = mupdf.Document.openDocument(pdfBytes, "application/pdf");
  const pixmap = doc.loadPage(0).toPixmap(mupdf.Matrix.scale(2, 2), mupdf.ColorSpace.DeviceRGB, false);
  const pngBytes = Buffer.from(pixmap.asPNG());
  await writeFile(`${dir}/sample.png`, pngBytes);

  return { pdf: pdfBytes, png: pngBytes };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { pdf, png } = await makeSamplePdf();
  console.log(`Wrote test/sample.pdf (${pdf.length} bytes) and test/sample.png (${png.length} bytes)`);
}
