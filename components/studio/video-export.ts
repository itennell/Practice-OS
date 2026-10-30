// Her own video, made into an MP4 in her browser: each clip's kept part is read
// with Mediabunny (MPL-2.0), cropped to the post's shape, the text and captions
// drawn on, and encoded to H.264 with WebCodecs at 30 fps. The clips' sound is
// cut and joined the same way. Nothing is uploaded: the file never leaves her
// computer. The same drawing code runs on the preview, so what she sees is what
// she gets. Same approach as the slide reel (components/instagram/reel-render.ts).
import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  canEncodeVideo,
  getFirstEncodableAudioCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from "mediabunny";
import type { Aspect, Clip, Cue, Overlay } from "@/lib/studio/doc";
import { activeCue, activeOverlays, OUTPUT, segments, totalSeconds } from "@/lib/studio/timeline";

export const FPS = 30;
const HIGH = new Quality("high");
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

export type ClipInfo = { duration: number; width: number; height: number; hasAudio: boolean };

/** Reads a video file's length and size in the browser (nothing is sent). Throws a plain message if it can't be read. */
export async function probeClip(file: Blob): Promise<ClipInfo> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error("That file isn't a video this browser can open. Try an MP4 or MOV.");
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("That file has no picture in it.");
    if (!(await video.canDecode())) throw new Error("This browser can't play that kind of video. Try Chrome or Safari, or save it as an MP4.");
    const audio = await input.getPrimaryAudioTrack();
    const first = await input.getFirstTimestamp().catch(() => 0);
    // The picture's length: sound that runs on past it (encoder padding) isn't part of the clip.
    const duration = (await video.computeDuration()) - Math.max(0, first);
    if (!(duration > 0)) throw new Error("That video has no length.");
    return { duration: Math.round(duration * 1000) / 1000, width: video.displayWidth, height: video.displayHeight, hasAudio: !!audio && (await audio.canDecode()) };
  } finally {
    input.dispose();
  }
}

/** True when this browser can encode H.264 at this size. */
export async function canMakeVideo(aspect: Aspect): Promise<boolean> {
  try {
    const { width, height } = OUTPUT[aspect];
    return typeof VideoEncoder !== "undefined" && (await canEncodeVideo("avc", { width, height, quality: HIGH }));
  } catch {
    return false;
  }
}

function wrap(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Words on a dark rounded box so they read on any footage. `cy` is the box's centre. */
function drawBoxedText(ctx: Ctx, text: string, W: number, cy: number, size: number, weight: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrap(ctx, text, W * 0.8);
  const lh = size * 1.25;
  const padX = size * 0.6;
  const padY = size * 0.35;
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const h = lines.length * lh + padY * 2;
  const top = Math.min(Math.max(cy - h / 2, 0), ctx.canvas.height - h);
  ctx.fillStyle = "rgba(20, 20, 19, 0.72)";
  ctx.beginPath();
  ctx.roundRect((W - w) / 2, top, w, h, size * 0.4);
  ctx.fill();
  ctx.fillStyle = "#FFFFFF";
  lines.forEach((l, i) => ctx.fillText(l, W / 2, top + padY + lh * (i + 0.5)));
}

const CENTRE: Record<Overlay["position"], number> = { top: 0.14, middle: 0.5, bottom: 0.74 };

/** Text overlays and the caption at time t, on a W x H frame. */
export function drawWords(ctx: Ctx, W: number, H: number, t: number, overlays: Overlay[], cues: Cue[] | null) {
  const unit = W / 1080;
  ctx.save();
  for (const o of activeOverlays(overlays, t)) drawBoxedText(ctx, o.text, W, H * CENTRE[o.position], 64 * unit, 650);
  const cue = cues ? activeCue(cues, t) : null;
  if (cue) drawBoxedText(ctx, cue.text, W, H * 0.88, 44 * unit, 500);
  ctx.restore();
}

/** Mixes the kept sound of every clip, in order, into one buffer on the finished video's timeline. Null when no clip has sound. */
export async function renderSound(clips: Clip[], files: Map<string, Blob>, sampleRate: number, channels: number, signal?: AbortSignal): Promise<AudioBuffer | null> {
  const total = totalSeconds(clips);
  if (total <= 0) return null;
  const offline = new OfflineAudioContext(channels, Math.max(1, Math.ceil(total * sampleRate)), sampleRate);
  let any = false;
  for (const seg of segments(clips)) {
    const file = files.get(seg.clip.source);
    if (!file || seg.end <= seg.start) continue;
    const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
    try {
      const track = await input.getPrimaryAudioTrack();
      if (!track || !(await track.canDecode())) continue;
      const first = Math.max(0, await input.getFirstTimestamp().catch(() => 0));
      const from = first + seg.clip.in;
      for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers(from, first + seg.clip.out)) {
        if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
        let when = seg.start + (timestamp - from);
        let offset = 0;
        if (when < seg.start) {
          offset = seg.start - when;
          when = seg.start;
        }
        const length = Math.min(buffer.duration - offset, seg.end - when);
        if (length <= 0) continue;
        const node = offline.createBufferSource();
        node.buffer = buffer;
        node.connect(offline.destination);
        node.start(when, offset, length);
        any = true;
      }
    } finally {
      input.dispose();
    }
  }
  return any ? offline.startRendering() : null;
}

export type ExportInput = { clips: Clip[]; overlays: Overlay[]; cues: Cue[] | null; aspect: Aspect; files: Map<string, Blob> };

/** Makes the MP4 (H.264, 30 fps, Instagram's size for the shape). `onProgress` gets 0..1. */
export async function exportVideo(job: ExportInput, onProgress?: (share: number) => void, signal?: AbortSignal): Promise<Blob> {
  const { width: W, height: H } = OUTPUT[job.aspect];
  const total = totalSeconds(job.clips);
  if (total <= 0) throw new Error("There's no video to make yet.");
  const stop = () => {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
  };
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the video.");

  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  const video = new CanvasSource(canvas, { codec: "avc", quality: HIGH });
  output.addVideoTrack(video, { frameRate: FPS });

  const sound = await renderSound(job.clips, job.files, 48_000, 2, signal);
  let audio: AudioBufferSource | null = null;
  if (sound) {
    const codec = await getFirstEncodableAudioCodec(output.format.getSupportedAudioCodecs(), { numberOfChannels: 2, sampleRate: 48_000, quality: HIGH });
    if (codec) {
      audio = new AudioBufferSource({ codec, quality: HIGH });
      output.addAudioTrack(audio);
    }
  }

  await output.start();
  try {
    if (audio && sound) await audio.add(sound);
    const frames = Math.round(total * FPS);
    let done = 0;
    for (const seg of segments(job.clips)) {
      const first = Math.round(seg.start * FPS);
      const last = Math.min(frames, Math.round(seg.end * FPS));
      if (last <= first) continue;
      const file = job.files.get(seg.clip.source);
      const input = file ? new Input({ formats: ALL_FORMATS, source: new BlobSource(file) }) : null;
      try {
        const track = input ? await input.getPrimaryVideoTrack() : null;
        const zero = input ? Math.max(0, await input.getFirstTimestamp().catch(() => 0)) : 0;
        const times = Array.from({ length: last - first }, (_, i) => (first + i) / FPS);
        const source = times.map((t) => zero + seg.clip.in + (t - seg.start));
        const sink = track ? new CanvasSink(track, { width: W, height: H, fit: "cover", poolSize: 2 }) : null;
        const iter = sink?.canvasesAtTimestamps(source);
        for (const t of times) {
          stop();
          const frame = iter ? (await iter.next()).value : null;
          ctx.fillStyle = "#000000";
          ctx.fillRect(0, 0, W, H);
          if (frame) ctx.drawImage(frame.canvas, 0, 0, W, H);
          drawWords(ctx, W, H, t, job.overlays, job.cues);
          await video.add(t, 1 / FPS);
          done++;
          if (done % 10 === 0) onProgress?.(done / frames);
        }
        await iter?.return(undefined);
      } finally {
        input?.dispose();
      }
    }
    await output.finalize();
  } catch (err) {
    await output.cancel().catch(() => {});
    throw err;
  }
  onProgress?.(1);
  return new Blob([output.target.buffer!], { type: "video/mp4" });
}
