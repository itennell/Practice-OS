import sharp from "sharp";
import { LIMITS } from "./graph";

// Instagram takes JPEG only, sRGB, aspect 4:5 to 1.91:1, 320 to 1440 px wide,
// at most 8 MB (reference/ig-user/media). Every post is a 4:5 portrait at
// 1080 x 1350, the size that fills the most of a phone's feed.
export const POST_WIDTH = 1080;
export const POST_HEIGHT = 1350;
/** The relay takes at most about 4 MB per picture (desktop-app, #31), below Meta's 8 MB. */
export const RELAY_IMAGE_BYTES = 4 * 1024 * 1024;

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
    if (jpeg.length <= RELAY_IMAGE_BYTES) return jpeg;
  }
  throw new Error("The picture is still over 4 MB after compressing it.");
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

/**
 * The 4:5 post as a 1080 x 1080 square, for anyone who wants the square grid
 * look: the whole picture, centered on a soft blurred fill of itself, so the
 * headline is never cut off.
 */
export async function toSquareJpeg(post: Buffer): Promise<Buffer> {
  const side = POST_WIDTH;
  const fill = await sharp(post).resize(side, side, { fit: "cover" }).blur(40).modulate({ brightness: 1.04 }).toBuffer();
  const front = await sharp(post).resize({ height: side, width: Math.round((side * POST_WIDTH) / POST_HEIGHT), fit: "inside" }).toBuffer();
  return sharp(fill)
    .composite([{ input: front, gravity: "center" }])
    .toColorspace("srgb")
    .jpeg({ quality: 90, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}
