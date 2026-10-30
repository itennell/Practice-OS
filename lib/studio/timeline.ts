// Timeline maths for her own video (kind "video"): which clip plays at a moment
// of the finished video, where in that file, what text and caption show then,
// how a frame is cropped to the post's shape, and how the sound is cut into
// short pieces for captions. Pure functions, shared by the preview, the MP4
// export and the captions maker, so all three agree.
import type { Aspect, Clip, Cue, Overlay, StudioDoc } from "./doc";

export type Segment = { index: number; clip: Clip; /** On the finished video. */ start: number; end: number };

/** The kept part of each clip, laid end to end. */
export function segments(clips: Clip[]): Segment[] {
  let t = 0;
  return clips.map((clip, index) => {
    const len = Math.max(0, clip.out - clip.in);
    const s = { index, clip, start: t, end: t + len };
    t += len;
    return s;
  });
}

export function totalSeconds(clips: Clip[]): number {
  return clips.reduce((t, c) => t + Math.max(0, c.out - c.in), 0);
}

/** What plays at time t of the finished video: the segment and the time inside its file. Null when there are no clips. */
export function locate(clips: Clip[], t: number): { seg: Segment; sourceTime: number } | null {
  const segs = segments(clips).filter((s) => s.end > s.start);
  if (!segs.length) return null;
  const at = Math.max(0, t);
  const seg = segs.find((s) => at < s.end) ?? segs[segs.length - 1];
  return { seg, sourceTime: Math.min(seg.clip.out, seg.clip.in + Math.max(0, at - seg.start)) };
}

/** Time on the finished video for a time inside segment `index`'s file. */
export function timelineTime(clips: Clip[], index: number, sourceTime: number): number {
  const seg = segments(clips)[index];
  if (!seg) return 0;
  return seg.start + Math.min(seg.end - seg.start, Math.max(0, sourceTime - seg.clip.in));
}

export function activeOverlays(overlays: Overlay[], t: number): Overlay[] {
  return overlays.filter((o) => t >= o.start && t < o.end);
}

export function activeCue(cues: Cue[], t: number): Cue | null {
  return cues.find((c) => t >= c.start && t < c.end) ?? null;
}

/** Export size for each shape (Instagram's own sizes). */
export const OUTPUT: Record<Aspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "4:5": { width: 1080, height: 1350 },
  "1:1": { width: 1080, height: 1080 },
};

/** The centre part of a source frame that fills the target shape (cover crop), as drawImage's source rectangle. */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const want = dstW / dstH;
  if (srcW / srcH > want) {
    const sw = srcH * want;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / want;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

/** Frame times (seconds on the finished video) at a fixed rate. */
export function frameTimes(total: number, fps: number): number[] {
  const n = Math.max(0, Math.round(total * fps));
  return Array.from({ length: n }, (_, i) => i / fps);
}

/** Pieces of the finished video's sound for captions: about `size` seconds each, the last one shorter. */
export function chunkRanges(total: number, size = 4): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (let s = 0; s < total - 0.05; s += size) out.push({ start: round(s), end: round(Math.min(total, s + size)) });
  return out;
}

/** A caption for one piece of sound: placed at the piece's place on the finished video. */
export function cueFor(range: { start: number; end: number }, text: string): Cue | null {
  const t = text.replace(/\s+/g, " ").trim().slice(0, 200);
  return t ? { start: range.start, end: range.end, text: t } : null;
}

/** True when a piece of sound is too quiet to have words in it (saves a call). */
export function isSilent(samples: Float32Array, threshold = 0.005): boolean {
  if (!samples.length) return true;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length) < threshold;
}

/** Mixes channels to one (the average). */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i] / channels.length;
  return out;
}

/** "0:04.2" */
export function clock(t: number): string {
  const s = Math.max(0, t);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  return `${m}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

/** Plain-words version for screen readers: "4.2 seconds". */
export function spokenSeconds(t: number): string {
  const r = Math.round(t * 10) / 10;
  return `${r} second${r === 1 ? "" : "s"}`;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Words for the doc's whole video (preview header): "3 clips, 0:12.4". */
export function videoSummary(doc: StudioDoc): string {
  const n = doc.clips.length;
  return `${n} clip${n === 1 ? "" : "s"}, ${clock(totalSeconds(doc.clips))}`;
}
