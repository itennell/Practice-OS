import type { ImageSegmentationResult } from "@meta-sam/parser";
import sharp from "sharp";
import { maskToAlpha } from "./meta";

/** Scales a 0/1 raster with nearest-neighbour and returns exactly one channel. */
async function resizeRaster(raster: Uint8Array, w: number, h: number, toW: number, toH: number) {
  const scaled = await sharp(Buffer.from(raster.map((v) => v * 255)), { raw: { width: w, height: h, channels: 1 } })
    .resize(toW, toH, { kernel: "nearest" })
    .extractChannel(0) // sharp otherwise returns 3 channels and the indexes shift
    .raw()
    .toBuffer();
  return new Uint8Array(scaled);
}

/** Turns an image plus a SAM result into a transparent PNG cut-out. */
export async function cutoutPng(image: Buffer, result: ImageSegmentationResult) {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error("Could not read the image size.");
  const alpha = await maskToAlpha(result, width, height, resizeRaster);
  // joinChannel adds the mask as the alpha channel. Do not chain removeAlpha():
  // sharp applies it last and would drop the mask.
  const png = await sharp(image)
    .joinChannel(Buffer.from(alpha), { raw: { width, height, channels: 1 } })
    .png()
    .toBuffer();
  const transparentShare = alpha.reduce((n, v) => n + (v === 0 ? 1 : 0), 0) / alpha.length;
  return { png, alpha, width, height, transparentShare };
}
