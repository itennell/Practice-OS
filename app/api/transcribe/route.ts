import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canDecide } from "@/lib/admin-guard";
import { transcribe, transcriptText } from "@/lib/meta";

// Clinician dictation for the message box (UI-015): a mono 16-bit WAV in,
// the words out. The audio is written to a temp file only for the call to
// muse-voice-transcribe-1.0 (lib/meta.ts reads from a path) and deleted after.
// The clinician reviews the text before anything is sent; nothing is stored.
const MAX_BYTES = 10 * 1024 * 1024; // about 3.5 minutes of 24 kHz mono

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Dictation isn't available here." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No recording was sent." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "That recording is too long. Keep it under 3 minutes." }, { status: 413 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
    return Response.json({ error: "The recording wasn't a WAV file." }, { status: 415 });
  }

  const file = path.join(tmpdir(), `practice-os-dictation-${randomUUID()}.wav`);
  try {
    await writeFile(file, bytes);
    const result = await transcribe("dictation", file, { mode: "PUSH_TO_TALK" });
    return Response.json({ text: transcriptText(result).trim() });
  } catch {
    return Response.json({ error: "Couldn't turn that recording into text. Try again, or type it." }, { status: 502 });
  } finally {
    await unlink(file).catch(() => {});
  }
}
