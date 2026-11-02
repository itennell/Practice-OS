// The picture for her Facebook/Instagram ad: a calm office with no people in it, so
// nobody in the ad could be read as a client. Made with muse-image-1.0 through
// lib/meta.ts (cookbook 05_muse_image, the same call Instagram uses); without a key,
// or if Muse fails, a plain-code picture in the app's own colors stands in. Always a
// 1080 x 1080 sRGB JPEG via sharp (Meta's square feed size).
import sharp from "sharp";
import { generateImage } from "../meta";

export const AD_IMAGE_SIDE = 1080;

/** A fixed prompt: nothing she or a model types reaches the image model. */
export const AD_IMAGE_PROMPT =
  "A calm, sunlit counseling office: two soft armchairs facing each other, a small side table, a leafy plant, warm neutral walls and a window with daylight. " +
  "Photographed from across the room. Empty room: no people, no faces, no hands, no text, no letters, no logos, no screens.";

export async function toAdJpeg(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize(AD_IMAGE_SIDE, AD_IMAGE_SIDE, { fit: "cover", position: "attention" })
    .flatten({ background: "#FAF9F5" })
    .toColorspace("srgb")
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: "4:4:4" })
    .toBuffer();
}

/** The stand-in picture: warm page colour, a soft accent circle like Aeon's orb, no text. */
export async function plainAdImage(): Promise<Buffer> {
  const s = AD_IMAGE_SIDE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <defs>
    <radialGradient id="o" cx="40%" cy="38%" r="60%"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.35" stop-color="#E3D9FF"/><stop offset="0.75" stop-color="#8E7CF8"/><stop offset="1" stop-color="#4E69DA"/></radialGradient>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FAF9F5"/><stop offset="1" stop-color="#E3E1D9"/></linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#g)"/>
  <circle cx="${s / 2}" cy="${s * 0.46}" r="${s * 0.26}" fill="url(#o)"/>
  <rect x="${s * 0.18}" y="${s * 0.8}" width="${s * 0.64}" height="${s * 0.012}" rx="6" fill="#65635C" opacity="0.25"/>
</svg>`;
  return toAdJpeg(Buffer.from(svg));
}

export type AdImage = { jpeg: Buffer; source: "muse" | "plain" };

export async function makeAdImage(deps: { draw?: (prompt: string) => Promise<Buffer>; hasKey?: boolean } = {}): Promise<AdImage> {
  const hasKey = deps.hasKey ?? (Boolean(deps.draw) || Boolean(process.env.MODEL_API_KEY));
  if (hasKey) {
    try {
      const draw = deps.draw ?? (async (p: string) => (await generateImage("growth.meta_ad_image", p)).image);
      return { jpeg: await toAdJpeg(await draw(AD_IMAGE_PROMPT)), source: "muse" };
    } catch (err) {
      console.error(`[growth] ad image: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { jpeg: await plainAdImage(), source: "plain" };
}
