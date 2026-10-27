// Dictation audio (UI-015): the browser records in its own format (webm/opus,
// mp4/aac); muse-voice-transcribe-1.0 wants a mono 16-bit WAV (lib/meta.ts,
// cookbook 06_muse_voice). These helpers turn one into the other.

/** Sample rate sent to transcription (the cookbook's ffmpeg line uses 24 kHz). */
export const DICTATION_RATE = 24_000;

/** A mono 16-bit PCM WAV file from float samples in -1..1. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const bytes = 44 + samples.length * 2;
  const buf = new ArrayBuffer(bytes);
  const v = new DataView(buf);
  const ascii = (at: number, s: string) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  v.setUint32(4, bytes - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  ascii(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

/** Decode a browser recording, mix it down to mono at 24 kHz and wrap it as WAV. */
export async function recordingToWav(recording: Blob): Promise<Blob> {
  const raw = await recording.arrayBuffer();
  const ctx = new AudioContext();
  try {
    const decoded = await ctx.decodeAudioData(raw);
    const frames = Math.max(1, Math.ceil(decoded.duration * DICTATION_RATE));
    const offline = new OfflineAudioContext(1, frames, DICTATION_RATE);
    const src = offline.createBufferSource();
    src.buffer = decoded;
    src.connect(offline.destination); // a mono destination downmixes every channel
    src.start();
    const mono = await offline.startRendering();
    return new Blob([encodeWav(mono.getChannelData(0), DICTATION_RATE)], { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

/** Send a WAV to the app's transcription route and return the text. */
export async function transcribeWav(wav: Blob, init: { headers?: HeadersInit } = {}): Promise<string> {
  const form = new FormData();
  form.append("audio", wav, "dictation.wav");
  const res = await fetch("/api/transcribe", { method: "POST", body: form, headers: init.headers });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok) throw new Error(body.error ?? "Couldn't turn that recording into text.");
  return body.text ?? "";
}
