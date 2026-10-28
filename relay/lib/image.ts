import sharp from "sharp";

/** Decodes an upload and writes a fresh JPEG from its pixels: no metadata, nothing appended. */
export async function reencodeImage(body: Uint8Array) {
  const input = sharp(Buffer.from(body), { limitInputPixels: 8192 * 8192 });
  const m = await input.metadata();
  const jpeg = await input.rotate().jpeg({ quality: 90 }).toBuffer();
  return { format: m.format ?? "", width: m.width ?? 0, height: m.height ?? 0, jpeg: new Uint8Array(jpeg) };
}
