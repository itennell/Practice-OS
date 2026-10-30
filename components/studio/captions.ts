// Make captions (one tap, off by default): the video's sound, as edited, is
// mixed to mono 24 kHz in her browser, cut into ~4 s pieces on the finished
// video's timeline, and each piece (sound only, never the video) goes to
// /api/studio/[id]/captions to be turned into words. Quiet pieces are skipped.
import type { Clip, Cue } from "@/lib/studio/doc";
import { chunkRanges, cueFor, isSilent, totalSeconds } from "@/lib/studio/timeline";
import { DICTATION_RATE, encodeWav } from "@/components/shared/dictation-audio";
import { renderSound } from "./video-export";

export type CaptionResult = { cues: Cue[]; skipped: string[]; stopped: string | null };

export async function makeCaptions(
  projectId: string,
  clips: Clip[],
  files: Map<string, Blob>,
  onProgress?: (done: number, of: number) => void,
  signal?: AbortSignal,
): Promise<CaptionResult> {
  const sound = await renderSound(clips, files, DICTATION_RATE, 1, signal);
  const ranges = chunkRanges(totalSeconds(clips));
  const result: CaptionResult = { cues: [], skipped: [], stopped: null };
  if (!sound) return result;
  const mono = sound.getChannelData(0);
  for (const [i, r] of ranges.entries()) {
    if (signal?.aborted) throw new DOMException("Stopped", "AbortError");
    onProgress?.(i, ranges.length);
    const piece = mono.subarray(Math.floor(r.start * DICTATION_RATE), Math.ceil(r.end * DICTATION_RATE));
    if (isSilent(piece)) continue;
    const form = new FormData();
    form.append("audio", new Blob([encodeWav(piece, DICTATION_RATE)], { type: "audio/wav" }), "piece.wav");
    form.append("start", String(r.start));
    const res = await fetch(`/api/studio/${encodeURIComponent(projectId)}/captions`, { method: "POST", body: form, signal });
    const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string; hardStop?: boolean };
    if (res.status === 422 && body.hardStop) {
      result.stopped = body.error ?? "Captions stopped.";
      result.cues = [];
      return result;
    }
    if (!res.ok) {
      if (res.status === 422) {
        result.skipped.push(body.error ?? "One part was left out.");
        continue;
      }
      throw new Error(body.error ?? "Couldn't make captions. Try again.");
    }
    const cue = cueFor(r, body.text ?? "");
    if (cue) result.cues.push(cue);
  }
  onProgress?.(ranges.length, ranges.length);
  return result;
}
