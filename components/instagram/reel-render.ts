// Makes the slide reel as an MP4 in her browser: each frame is drawn on a canvas
// and encoded to H.264 with WebCodecs, then put in an MP4 file with Mediabunny
// (MPL-2.0). Nothing to install, nothing uploaded: the video never leaves her
// computer. Gentle fades only, and a slow drift on the picture (no loud
// transitions).
import { BufferTarget, CanvasSource, canEncodeVideo, Mp4OutputFormat, Output, Quality } from "mediabunny";
import type { Reel, Slide } from "@/lib/instagram/reel";

export const REEL_W = 1080;
export const REEL_H = 1920;
export const FPS = 30;
const FADE = 0.4; // seconds

const INK = "#1F1E1D";
const MUTED = "#65635C";
const PAPER = "#FAF9F5";
const ACCENT = "#5B47C9";
const HIGH = new Quality("high");

export type ReelAssets = { picture: ImageBitmap; practiceName: string; licenseLine: string; fontFamily: string };

/** True when this browser can encode a 1080x1920 H.264 video. */
export async function canMakeVideo(): Promise<boolean> {
  try {
    return typeof VideoEncoder !== "undefined" && (await canEncodeVideo("avc", { width: REEL_W, height: REEL_H, quality: HIGH }));
  } catch {
    return false;
  }
}

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

function drawPicture(ctx: CanvasRenderingContext2D, a: ReelAssets, progress: number) {
  // The picture on the same calm paper as the word slides, drifting up and in by 3% (slow, no motion tricks).
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  const scale = 1 + 0.03 * progress;
  const w = REEL_W * scale;
  const h = (REEL_W * a.picture.height * scale) / a.picture.width;
  ctx.drawImage(a.picture, (REEL_W - w) / 2, (REEL_H - h) / 2 - 20 * progress, w, h);
}

function drawWords(ctx: CanvasRenderingContext2D, slide: Slide, index: number, points: number, a: ReelAssets) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, REEL_W, REEL_H);
  ctx.fillStyle = ACCENT;
  ctx.fillRect(96, 300, 72, 8);
  ctx.textBaseline = "top";
  ctx.fillStyle = MUTED;
  ctx.font = `500 40px ${a.fontFamily}`;
  ctx.fillText(slide.kind === "book" ? "How to book" : `${index} of ${points}`, 96, 340);
  ctx.fillStyle = INK;
  ctx.font = `650 84px ${a.fontFamily}`;
  const lines = wrap(ctx, slide.text, REEL_W - 192);
  const top = Math.max(440, (REEL_H - lines.length * 104) / 2 - 80);
  lines.forEach((l, i) => ctx.fillText(l, 96, top + i * 104));
  ctx.font = `600 40px ${a.fontFamily}`;
  ctx.fillText(a.practiceName, 96, REEL_H - 300);
  ctx.fillStyle = MUTED;
  ctx.font = `400 32px ${a.fontFamily}`;
  for (const [i, l] of wrap(ctx, a.licenseLine, REEL_W - 192).entries()) ctx.fillText(l, 96, REEL_H - 244 + i * 42);
}

function drawSlide(ctx: CanvasRenderingContext2D, reel: Reel, i: number, progress: number, a: ReelAssets) {
  const slide = reel.slides[i];
  if (slide.kind === "picture") return drawPicture(ctx, a, progress);
  const points = reel.slides.filter((s) => s.kind === "point").length;
  const number = reel.slides.slice(0, i + 1).filter((s) => s.kind === "point").length;
  drawWords(ctx, slide, number, points, a);
}

/** Draws the frame at time t (seconds): the current slide, fading into the next one at its end. */
export function drawFrame(ctx: CanvasRenderingContext2D, reel: Reel, t: number, a: ReelAssets) {
  const per = reel.seconds / reel.slides.length;
  const i = Math.min(reel.slides.length - 1, Math.floor(t / per));
  const into = t - i * per;
  ctx.globalAlpha = 1;
  drawSlide(ctx, reel, i, into / per, a);
  const fadeAt = per - FADE;
  if (i < reel.slides.length - 1 && into > fadeAt) {
    ctx.globalAlpha = (into - fadeAt) / FADE;
    drawSlide(ctx, reel, i + 1, 0, a);
    ctx.globalAlpha = 1;
  }
}

/** Renders the whole reel to an MP4 file (H.264, 30 fps, 1080x1920). */
export async function renderReel(reel: Reel, a: ReelAssets, onProgress?: (share: number) => void): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = REEL_W;
  canvas.height = REEL_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the reel.");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: "avc", quality: HIGH });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const frames = reel.seconds * FPS;
  for (let f = 0; f < frames; f++) {
    drawFrame(ctx, reel, f / FPS, a);
    await source.add(f / FPS, 1 / FPS);
    if (f % FPS === 0) onProgress?.(f / frames);
  }
  await output.finalize();
  onProgress?.(1);
  return new Blob([output.target.buffer!], { type: "video/mp4" });
}
