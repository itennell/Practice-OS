import { canDecide } from "@/lib/admin-guard";
import { SAMPLE_TRANSCRIPTS, simulateVoicemail, type SampleKind } from "@/lib/frontdesk/test-console";

// "Simulate a voicemail": one [Sample] voicemail through the real pipeline, on a
// stand-in phone that can't text anyone.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { kind } = ((await request.json().catch(() => ({}))) ?? {}) as { kind?: unknown };
  const k: SampleKind = typeof kind === "string" && kind in SAMPLE_TRANSCRIPTS ? (kind as SampleKind) : "booking";
  return Response.json(await simulateVoicemail(k));
}
