// What a file she drops into the chat is, by its first bytes (never its name),
// and its text, read on her own computer. PDF (unpdf), Word .docx (mammoth) and
// plain text only for now; photos and scans are refused in plain words.

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_PAGES = 30;
/** Most text one file may hold. Every check reads all of it; a longer file is refused, never cut. */
export const MAX_CHARS = 60_000;
/** A .docx is a zip: its entries may unpack to at most this much, in at most this many entries. */
export const MAX_UNZIPPED = 25 * 1024 * 1024;
export const MAX_ZIP_ENTRIES = 2000;
export const TOO_LONG = "That file is too long for me to check. Send the pages that matter.";

export const PDF = "application/pdf";
export const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const TXT = "text/plain";
export type Mime = typeof PDF | typeof DOCX | typeof TXT;
export const EXT: Record<Mime, "pdf" | "docx" | "txt"> = { [PDF]: "pdf", [DOCX]: "docx", [TXT]: "txt" };

export const NOT_SUPPORTED = "Photos and scans aren't supported yet. Send a PDF, Word file or text.";

export class UnreadableFile extends Error {}

const starts = (b: Uint8Array, ...sig: number[]) => sig.every((v, i) => b[i] === v);
const ascii = (b: Uint8Array, at: number, s: string) => [...s].every((c, i) => b[at + i] === c.charCodeAt(0));

function isImage(b: Uint8Array): boolean {
  return (
    starts(b, 0x89, 0x50, 0x4e, 0x47) || // PNG
    starts(b, 0xff, 0xd8, 0xff) || // JPEG
    ascii(b, 0, "GIF8") ||
    (ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP")) ||
    (ascii(b, 4, "ftyp") && ["heic", "heix", "mif1", "avif"].some((t) => ascii(b, 8, t))) ||
    starts(b, 0x49, 0x49, 0x2a, 0x00) || // TIFF
    starts(b, 0x4d, 0x4d, 0x00, 0x2a)
  );
}

/**
 * Reads a zip's central directory (never unpacking it) and refuses a zip bomb:
 * more than MAX_ZIP_ENTRIES entries, more than MAX_UNZIPPED bytes unpacked, or a
 * ZIP64 archive (which hides real sizes in an extra field).
 */
export function checkZipSize(bytes: Uint8Array): void {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const bad = () => new UnreadableFile("I couldn't open that Word file. Save it again as .docx or PDF and send it.");
  // End of central directory: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw bad();
  const entries = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (entries === 0xffff || cdOffset === 0xffffffff) throw bad();
  if (entries > MAX_ZIP_ENTRIES) throw new UnreadableFile("That Word file is too big for me to open safely. Save it as PDF and send it.");
  let at = cdOffset;
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (at + 46 > buf.length || buf.readUInt32LE(at) !== 0x02014b50) throw bad();
    const size = buf.readUInt32LE(at + 24);
    if (size === 0xffffffff) throw bad();
    total += size;
    if (total > MAX_UNZIPPED) throw new UnreadableFile("That Word file is too big for me to open safely. Save it as PDF and send it.");
    at += 46 + buf.readUInt16LE(at + 28) + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
}

/** The file's type from its bytes. Throws UnreadableFile with what to do instead. */
export function sniff(bytes: Uint8Array): Mime {
  if (bytes.length === 0) throw new UnreadableFile("That file is empty.");
  if (bytes.length > MAX_BYTES) throw new UnreadableFile("That file is over 10 MB. Send a smaller copy.");
  if (ascii(bytes, 0, "%PDF-")) return PDF;
  if (starts(bytes, 0x50, 0x4b, 0x03, 0x04)) {
    // A .docx is a zip with word/document.xml inside; other zips (and .xlsx) aren't.
    if (Buffer.from(bytes).includes("word/document.xml")) {
      checkZipSize(bytes);
      return DOCX;
    }
    throw new UnreadableFile("I can read PDFs, Word (.docx) files and plain text. Save it as one of those and send it again.");
  }
  if (starts(bytes, 0xd0, 0xcf, 0x11, 0xe0)) throw new UnreadableFile("That's an older Word file (.doc). Save it as .docx or PDF and send it again.");
  if (isImage(bytes)) throw new UnreadableFile(NOT_SUPPORTED);
  const head = bytes.subarray(0, 8192);
  if (!head.includes(0)) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return TXT;
    } catch {
      // not text
    }
  }
  throw new UnreadableFile("I can read PDFs, Word (.docx) files and plain text. Save it as one of those and send it again.");
}

/** The file's text, read here. A PDF with no text in it is a scan. */
export async function readText(bytes: Uint8Array, mime: Mime): Promise<string> {
  let text: string;
  if (mime === PDF) {
    const { getDocumentProxy, extractText } = await import("unpdf");
    let pdf;
    try {
      pdf = await getDocumentProxy(new Uint8Array(bytes));
    } catch (err) {
      console.error(`[uploads] pdf: ${err instanceof Error ? err.message : String(err)}`);
      throw new UnreadableFile("I couldn't open that PDF. If it has a password, remove it and send it again.");
    }
    if (pdf.numPages > MAX_PAGES) throw new UnreadableFile(`That PDF has ${pdf.numPages} pages. Send the part that matters, up to ${MAX_PAGES} pages.`);
    text = (await extractText(pdf, { mergePages: true })).text;
  } else if (mime === DOCX) {
    const mammoth = await import("mammoth");
    try {
      text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    } catch {
      throw new UnreadableFile("I couldn't open that Word file. Save it again as .docx or PDF and send it.");
    }
  } else {
    text = new TextDecoder().decode(bytes);
  }
  text = text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.replace(/\s/g, "").length < 40) {
    throw new UnreadableFile(mime === PDF ? `That PDF looks like a scan, with no text inside. ${NOT_SUPPORTED}` : "There's almost no text in that file.");
  }
  if (text.length > MAX_CHARS) throw new UnreadableFile(TOO_LONG);
  return text;
}
