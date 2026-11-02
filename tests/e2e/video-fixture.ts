import type { Page } from "@playwright/test";
import path from "node:path";

// Test fixtures for the studio's video specs: a short test video made in the
// page, and a watch on what the page sends (her video must never leave it).

const MB_BUNDLE = path.join(process.cwd(), "node_modules/mediabunny/dist/bundles/mediabunny.min.cjs");
export const LIMIT = 200 * 1024;

export type Sent = { url: string; method: string; bytes: number; mp4: boolean };

export function watchNetwork(page: Page): Sent[] {
  const sent: Sent[] = [];
  page.on("request", (r) => {
    const body = r.postDataBuffer();
    sent.push({ url: r.url(), method: r.method(), bytes: body?.length ?? 0, mp4: Boolean(body) && body!.includes(Buffer.from("ftyp")) });
  });
  return sent;
}

/** A 1280x720 H.264 MP4 with a 440 Hz tone, made in the page with Mediabunny (canvas + WebCodecs). */
export async function makeTestVideo(page: Page, seconds = 4): Promise<Buffer> {
  await page.addScriptTag({ path: MB_BUNDLE });
  const b64 = await page.evaluate(async (secs) => {
    const M = (window as unknown as { Mediabunny: typeof import("mediabunny") }).Mediabunny;
    const W = 1280;
    const H = 720;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d")!;
    const output = new M.Output({ format: new M.Mp4OutputFormat({ fastStart: "in-memory" }), target: new M.BufferTarget() });
    const video = new M.CanvasSource(canvas, { codec: "avc", quality: new M.Quality("medium") });
    output.addVideoTrack(video, { frameRate: 30 });
    const codec = await M.getFirstEncodableAudioCodec(output.format.getSupportedAudioCodecs(), { numberOfChannels: 1, sampleRate: 48000 });
    const audio = codec ? new M.AudioBufferSource({ codec, quality: new M.Quality("medium") }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    if (audio) {
      const rate = 48000;
      const buf = new AudioBuffer({ length: rate * secs, numberOfChannels: 1, sampleRate: rate });
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / rate);
      await audio.add(buf);
    }
    for (let f = 0; f < secs * 30; f++) {
      ctx.fillStyle = "hsl(" + ((f * 4) % 360) + " 60% 50%)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 120px sans-serif";
      ctx.fillText((f / 30).toFixed(1) + "s", 80, 400);
      await video.add(f / 30, 1 / 30);
    }
    await output.finalize();
    const bytes = new Uint8Array(output.target.buffer!);
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }, seconds);
  return Buffer.from(b64, "base64");
}

