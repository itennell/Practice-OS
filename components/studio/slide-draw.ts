// Draws a studio slide (carousel card or reel slide) on a canvas, in the
// document's colours and shape, and makes the files she downloads: a JPEG per
// carousel slide, and the reel as an MP4 made in her browser (WebCodecs +
// Mediabunny, MPL-2.0), the same calm look as the first reel: gentle fades, a
// slow drift on the picture, nothing loud. Nothing is uploaded.
import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, Quality } from "mediabunny";
import { PALETTE, type Aspect, type StudioDoc } from "@/lib/studio/doc";

export const SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "4:5": { w: 1080, h: 1350 },
  "1:1": { w: 1080, h: 1080 },
};
const FPS = 30;
const FADE = 0.4;
const HIGH = new Quality("high");

export type DrawAssets = { picture: ImageBitmap | null; practiceName: string; licenseLine: string; fontFamily: string };

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPicture(ctx: CanvasRenderingContext2D, doc: StudioDoc, a: DrawAssets, progress: number) {
  const { w: W, h: H } = SIZE[doc.aspect];
  const p = PALETTE[doc.palette];
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);
  if (!a.picture) return;
  // Fit the 4:5 picture's width, drifting up and in by 3% on a reel.
  const scale = 1 + 0.03 * progress;
  const w = W * scale;
  const h = (W * a.picture.height * scale) / a.picture.width;
  ctx.drawImage(a.picture, (W - w) / 2, (H - h) / 2 - 20 * progress, w, h);
}

function drawWords(ctx: CanvasRenderingContext2D, doc: StudioDoc, i: number, a: DrawAssets) {
  const { w: W, h: H } = SIZE[doc.aspect];
  const p = PALETTE[doc.palette];
  const slide = doc.slides[i];
  const points = doc.slides.filter((s) => s.kind === "point").length;
  const number = doc.slides.slice(0, i + 1).filter((s) => s.kind === "point").length;
  const pad = 96;
  const tall = H / 1920;
  ctx.fillStyle = p.paper;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = p.accent;
  ctx.fillRect(pad, 300 * tall, 72, 8);
  ctx.textBaseline = "top";
  ctx.fillStyle = p.muted;
  ctx.font = `500 40px ${a.fontFamily}`;
  ctx.fillText(slide.kind === "book" ? "How to book" : `${number} of ${points}`, pad, 300 * tall + 40);
  ctx.fillStyle = p.ink;
  const size = H < 1400 ? 72 : 84;
  ctx.font = `650 ${size}px ${a.fontFamily}`;
  const lines = wrap(ctx, slide.text, W - pad * 2);
  const lh = size * 1.24;
  const top = Math.max(300 * tall + 140, (H - lines.length * lh) / 2 - 60 * tall);
  lines.forEach((l, k) => ctx.fillText(l, pad, top + k * lh));
  ctx.font = `600 40px ${a.fontFamily}`;
  ctx.fillText(a.practiceName, pad, H - 300 * tall);
  ctx.fillStyle = p.muted;
  ctx.font = `400 32px ${a.fontFamily}`;
  for (const [k, l] of wrap(ctx, a.licenseLine, W - pad * 2).entries()) ctx.fillText(l, pad, H - 300 * tall + 56 + k * 42);
}

/** One slide, still: what the canvas strip and a carousel JPEG show. */
export function drawSlide(ctx: CanvasRenderingContext2D, doc: StudioDoc, i: number, a: DrawAssets, progress = 0) {
  if (doc.slides[i]?.kind === "picture") drawPicture(ctx, doc, a, progress);
  else if (doc.slides[i]) drawWords(ctx, doc, i, a);
}

/** Where slide i starts on the reel, in seconds. */
export function slideStart(doc: StudioDoc, i: number): number {
  return doc.slides.slice(0, i).reduce((t, s) => t + s.seconds, 0);
}

/** The reel's frame at time t: the current slide, fading into the next at its end. */
export function drawReelFrame(ctx: CanvasRenderingContext2D, doc: StudioDoc, t: number, a: DrawAssets) {
  let i = 0;
  while (i < doc.slides.length - 1 && t >= slideStart(doc, i + 1)) i++;
  const into = t - slideStart(doc, i);
  const per = doc.slides[i].seconds;
  ctx.globalAlpha = 1;
  drawSlide(ctx, doc, i, a, into / per);
  const fadeAt = per - FADE;
  if (i < doc.slides.length - 1 && into > fadeAt) {
    ctx.globalAlpha = Math.min(1, (into - fadeAt) / FADE);
    drawSlide(ctx, doc, i + 1, a, 0);
    ctx.globalAlpha = 1;
  }
}

export async function canMakeVideo(aspect: Aspect): Promise<boolean> {
  try {
    return typeof VideoEncoder !== "undefined" && (await canEncodeVideo("avc", { width: SIZE[aspect].w, height: SIZE[aspect].h, quality: HIGH }));
  } catch {
    return false;
  }
}

function canvasFor(doc: StudioDoc) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE[doc.aspect].w;
  canvas.height = SIZE[doc.aspect].h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the slides.");
  return { canvas, ctx };
}

/** A carousel slide as a JPEG file. */
export async function slideJpeg(doc: StudioDoc, i: number, a: DrawAssets): Promise<Blob> {
  const { canvas, ctx } = canvasFor(doc);
  drawSlide(ctx, doc, i, a);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("Couldn't make the picture."))), "image/jpeg", 0.92));
}

/** The slide reel as an MP4 (H.264, 30 fps), in her browser. */
export async function renderSlideReel(doc: StudioDoc, a: DrawAssets, onProgress?: (share: number) => void, signal?: AbortSignal): Promise<Blob> {
  const { canvas, ctx } = canvasFor(doc);
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const total = doc.slides.reduce((t, s) => t + s.seconds, 0);
  const frames = Math.round(total * FPS);
  for (let f = 0; f < frames; f++) {
    if (signal?.aborted) {
      await output.cancel();
      throw new DOMException("Stopped", "AbortError");
    }
    drawReelFrame(ctx, doc, f / FPS, a);
    await source.add(f / FPS, 1 / FPS);
    if (f % FPS === 0) onProgress?.(f / frames);
  }
  await output.finalize();
  onProgress?.(1);
  return new Blob([output.target.buffer!], { type: "video/mp4" });
}

/** Saves a file she made in the browser. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
