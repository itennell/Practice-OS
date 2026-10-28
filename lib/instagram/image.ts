import sharp from "sharp";
import { LIMITS } from "./graph";

// Instagram takes JPEG only, sRGB, aspect 4:5 to 1.91:1, 320 to 1440 px wide,
// at most 8 MB (reference/ig-user/media). Every post is a 4:5 portrait at
// 1080 x 1350, the size that fills the most of a phone's feed.
export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;

/** Any image in, an Instagram-ready JPEG out. Metadata (EXIF, GPS) is dropped. */
export async function toInstagramJpeg(input: Buffer): Promise<Buffer> {
  for (const quality of [90, 82, 74]) {
    const jpeg = await sharp(input)
      .rotate() // honor EXIF orientation before it is stripped
      .resize(POST_WIDTH, POST_HEIGHT, { fit: "cover", position: "attention" })
      .flatten({ background: "#FFFFFF" }) // JPEG has no alpha
      .toColorspace("srgb")
      .jpeg({ quality, mozjpeg: true, chromaSubsampling: "4:4:4" })
      .toBuffer();
    if (jpeg.length <= LIMITS.imageBytes) return jpeg;
  }
  throw new Error("The image is still over Instagram's 8 MB limit after compressing it.");
}

/** What tests and the executor check before anything goes to Meta. */
export async function checkInstagramJpeg(jpeg: Buffer): Promise<string[]> {
  const meta = await sharp(jpeg).metadata();
  const problems: string[] = [];
  if (meta.format !== "jpeg") problems.push(`Instagram needs a JPEG, not ${meta.format}.`);
  if (jpeg.length > LIMITS.imageBytes) problems.push("The image is over 8 MB.");
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (w < 320 || w > 1440) problems.push(`The image is ${w} px wide; Instagram wants 320 to 1440.`);
  const ratio = w / Math.max(1, h);
  if (ratio < 0.8 - 0.005 || ratio > 1.91 + 0.005) problems.push(`The image shape (${w}x${h}) is outside 4:5 to 1.91:1.`);
  if (meta.space !== "srgb") problems.push(`The image colors are ${meta.space}, not sRGB.`);
  return problems;
}
