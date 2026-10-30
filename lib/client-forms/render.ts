import { PDFDocument, StandardFonts } from "pdf-lib";
import { LINE, M, MUTED, W, Writer, formBox, signatureLine } from "../gfe/pdf";
import { ATTORNEY_LINE, type Block, type FormDef, type PracticeFacts } from "./types";

// Turns a form's blocks into a letter-size PDF with real, selectable text and
// fillable boxes (the same Writer as the GFE, superbill and release form). The
// client's boxes are always empty: what they type stays in their copy.

export type Overrides = { clauses?: Record<string, string>; extra?: string };

/** The form's blocks with her edits applied. Only editable clauses change; an added paragraph goes before the signatures. */
export function blocksFor(def: FormDef, facts: PracticeFacts, overrides: Overrides = {}): Block[] {
  const blocks = def.build(facts).map((b) =>
    b.kind === "clause" && b.editable && overrides.clauses?.[b.id]?.trim() ? { ...b, text: overrides.clauses[b.id].trim() } : b,
  );
  const extra = overrides.extra?.trim();
  if (extra) {
    const at = blocks.findIndex((b) => b.kind === "signature");
    const add: Block[] = [{ kind: "clause", id: "her_addition", text: extra }];
    if (at < 0) blocks.push(...add);
    else blocks.splice(at, 0, ...add);
  }
  return blocks;
}

/** Every word the form prints, in order: what check.ts reads when there is no PDF yet. */
export function plainText(def: FormDef, facts: PracticeFacts, blocks: Block[]): string {
  const out = [headerLines(def, facts).join(" ")];
  for (const b of blocks) {
    if (b.kind === "heading" || b.kind === "clause") out.push(b.text);
    else if (b.kind === "field" || b.kind === "check") out.push(b.label);
    else if (b.kind === "scale") out.push(`${b.item} ${b.options.join(" ")}`);
    else if (b.kind === "signature") out.push(b.caption);
    else out.push(`${b.label} ${b.value}`);
  }
  out.push(ATTORNEY_LINE);
  return out.join("\n");
}

function headerLines(def: FormDef, f: PracticeFacts): string[] {
  const demo = f.isSample ? " (fictional demo practice)" : "";
  return [`${f.practiceName}${demo}`, def.title, `${f.street}, ${f.city}, ${f.state} ${f.zip} · ${f.phone}`];
}

export async function renderForm(def: FormDef, facts: PracticeFacts, overrides: Overrides = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(def.title);
  pdf.setProducer("Practice-OS");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const footer = `${facts.isSample ? "[Sample] Fictional demo practice. " : ""}${def.title}`;
  const w = new Writer(pdf, regular, bold, footer.slice(0, 110));
  const form = pdf.getForm();

  const [name, title, address] = headerLines(def, facts);
  w.text(winAnsi(name), { size: 16, bold: true, gap: 2 });
  w.text(winAnsi(title), { size: 13, gap: 2 });
  w.text(winAnsi(address), { color: MUTED, gap: 2 });
  if (facts.isSample) w.text("[Sample] Every name and number on this form is fake, for a fictional demo practice.", { size: 9, color: MUTED });

  const used = new Set<string>();
  const fieldName = (id: string) => {
    let n = id;
    for (let i = 2; used.has(n); i++) n = `${id}_${i}`;
    used.add(n);
    return n;
  };

  for (const b of blocksFor(def, facts, overrides)) {
    if (b.kind === "heading") w.heading(winAnsi(b.text));
    else if (b.kind === "clause") w.text(winAnsi(b.text), { size: b.small ? 9 : 10, color: b.small ? MUTED : undefined, gap: 6 });
    else if (b.kind === "practice") w.field(winAnsi(b.label), winAnsi(b.value));
    else if (b.kind === "field") formBox(w, form, fieldName(b.id), winAnsi(b.label), { lines: b.lines });
    else if (b.kind === "check") checkBox(w, form, fieldName(b.id), winAnsi(b.label));
    else if (b.kind === "scale") scaleRow(w, form, fieldName(b.id), winAnsi(b.item), b.options.map(winAnsi));
    else {
      signatureLine(w, winAnsi(b.caption));
      w.y -= 4;
    }
  }

  w.y -= 8;
  w.text(ATTORNEY_LINE, { size: 8.5, color: MUTED });
  form.updateFieldAppearances(regular);
  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(`Page ${i + 1} of ${pages.length}`, { x: W - M - 60, y: 30, size: 8, font: regular, color: MUTED }));
  return pdf.save();
}

function checkBox(w: Writer, form: ReturnType<PDFDocument["getForm"]>, name: string, label: string) {
  const lines = w.wrap(label, w.regular, 9.5, W - 2 * M - 22);
  w.ensure(lines.length * 12 + 6);
  const box = form.createCheckBox(name);
  box.addToPage(w.page, { x: M, y: w.y - 13, width: 11, height: 11, borderColor: MUTED, borderWidth: 0.8 });
  lines.forEach((l, i) => w.page.drawText(l, { x: M + 20, y: w.y - 11 - i * 12, size: 9.5, font: w.regular }));
  w.y -= lines.length * 12 + 7;
}

/** A question on the left, one tick box per answer on the right, the answers' words over the boxes. */
function scaleRow(w: Writer, form: ReturnType<PDFDocument["getForm"]>, name: string, item: string, options: string[]) {
  const left = 250;
  const col = (W - 2 * M - left) / options.length;
  const lines = w.wrap(item, w.regular, 9.5, left - 12);
  const heads = options.map((o) => w.wrap(o, w.regular, 7.5, col - 4));
  const height = Math.max(lines.length * 12, Math.max(...heads.map((h) => h.length)) * 9 + 16) + 6;
  w.ensure(height);
  lines.forEach((l, i) => w.page.drawText(l, { x: M, y: w.y - 11 - i * 12, size: 9.5, font: w.regular }));
  options.forEach((_, i) => {
    const x = M + left + i * col;
    heads[i].forEach((h, j) => w.page.drawText(h, { x, y: w.y - 8 - j * 9, size: 7.5, font: w.regular, color: MUTED }));
    const box = form.createCheckBox(`${name}_${i}`);
    box.addToPage(w.page, { x, y: w.y - 12 - heads[i].length * 9 - 4, width: 11, height: 11, borderColor: MUTED, borderWidth: 0.8 });
  });
  w.y -= height;
  w.page.drawLine({ start: { x: M, y: w.y + 2 }, end: { x: W - M, y: w.y + 2 }, thickness: 0.4, color: LINE });
}

/**
 * Helvetica in pdf-lib speaks WinAnsi only: swap the few characters templates use
 * that it can't draw. Tabs and carriage returns become spaces (pdf-lib can't
 * encode them, and a pasted paragraph often has them). En and em dashes are
 * WinAnsi, so they stay (the PHQ-9 prints its em dashes word for word).
 */
export function winAnsi(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/[\t\r]/g, " ")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/≥/g, ">=")
    .replace(/[^\n\x20-\x7E\u00A0-\u00FF\u2013\u2014\u2022]/g, "");
}
