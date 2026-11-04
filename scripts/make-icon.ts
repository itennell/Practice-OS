// Draws Aeon's orb as the app icon: a radial gradient circle (#ffffff, #E3D9FF,
// #8E7CF8, #4E69DA, highlight up and to the left, like the CSS orb), saved as
// app/icon.png (512px) and app/favicon.ico (16, 32 and 48px PNGs in one ICO).
// Run: npx tsx scripts/make-icon.ts
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const svg = (size: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="g" cx="35%" cy="30%" r="75%" fx="35%" fy="30%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="28%" stop-color="#E3D9FF"/>
      <stop offset="62%" stop-color="#8E7CF8"/>
      <stop offset="100%" stop-color="#4E69DA"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#g)"/>
</svg>`;

const png = (size: number) => sharp(Buffer.from(svg(size))).png().toBuffer();

/** An ICO file holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(async (size) => ({ size, data: await png(size) })));
writeFileSync("app/favicon.ico", ico(images));
writeFileSync("app/icon.png", await png(512));
console.log("Wrote app/favicon.ico and app/icon.png");
