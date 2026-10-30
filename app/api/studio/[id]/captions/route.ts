import { randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { canDecide } from "@/lib/admin-guard";
import { REFUSAL, guard } from "@/lib/aeon/guard";
import { audit } from "@/lib/audit";
import { isSameOrigin } from "@/lib/connect/local-only";
import { transcribe, transcriptText } from "@/lib/meta";
import { alertCrisis, checkCrisis, CRISIS_REPLY } from "@/lib/safety";
import { getProject } from "@/lib/studio/store";
import { isUuid } from "../../../approvals/responses";

// Captions for her own video, one short piece of sound at a time: her browser
// sends the sound only (a mono 16-bit WAV, never the video) and where it sits on
// the video. The sound goes to a temp file for muse-voice-transcribe-1.0
// (lib/meta.ts reads from a path) and is deleted after; nothing is stored here.
// The words pass the crisis check and the client-detail guard before they come
// back; the cues are saved later as one edit, which the studio checks again.
const MAX_BYTES = 1024 * 1024; // a 4-second piece is about 192 KB
const MAX_START = 600;

export async function POST(request: Request, { params }: RouteContext<"/api/studio/[id]/captions">) {
  if (!canDecide(request) || !isSameOrigin(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id) || !(await getProject(id))) return Response.json({ error: "That video isn't here any more." }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  const start = Number(form?.get("start"));
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No sound was sent." }, { status: 400 });
  if (!Number.isFinite(start) || start < 0 || start > MAX_START) return Response.json({ error: "Where that sound goes wasn't sent." }, { status: 400 });
  if (audio.size > MAX_BYTES) return Response.json({ error: "That piece of sound is too long." }, { status: 413 });

  const bytes = Buffer.from(await audio.arrayBuffer());
  if (bytes.subarray(0, 4).toString("ascii") !== "RIFF" || bytes.subarray(8, 12).toString("ascii") !== "WAVE") {
    return Response.json({ error: "The sound wasn't a WAV file." }, { status: 415 });
  }

  const file = path.join(tmpdir(), `practice-os-captions-${randomUUID()}.wav`);
  let text: string;
  try {
    await writeFile(file, bytes);
    text = transcriptText(await transcribe("studio_captions", file, { mode: "PUSH_TO_TALK" })).trim();
  } catch {
    return Response.json({ error: "Couldn't turn the sound into words. Try again." }, { status: 502 });
  } finally {
    await unlink(file).catch(() => {});
  }
  if (!text) return Response.json({ text: "" });

  const crisis = checkCrisis(text);
  if (crisis.crisis) {
    await audit({ actor: "safety", action: "crisis_reply", subjectType: "studio_project", subjectId: id, details: { category: crisis.category, by: "clinician", at: "captions" } });
    await alertCrisis({ source: "media", category: crisis.category, by: "clinician" });
    return Response.json({ error: CRISIS_REPLY, hardStop: true }, { status: 422 });
  }
  const guarded = await guard(text, "message");
  if (!guarded.ok) {
    await audit({ actor: "safety", action: "phi_refused", subjectType: "studio_project", subjectId: id, details: { kind: guarded.kind, by: "clinician", at: "captions" } });
    return Response.json({ error: REFUSAL[guarded.kind] }, { status: 422 });
  }
  return Response.json({ text });
}
