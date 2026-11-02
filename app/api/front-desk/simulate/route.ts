import { FRONT_DESK_ENABLED } from "@/lib/features";
import { canDecide } from "@/lib/admin-guard";
import { SAMPLE_TRANSCRIPTS, simulateVoicemail, type SampleKind } from "@/lib/frontdesk/test-console";

// "Simulate a voicemail": one [Sample] voicemail through the real pipeline, on a
// stand-in phone that can't text anyone. No kind means the booking sample; an
// unknown kind (or an inherited name like "constructor") is refused.
export async function POST(request: Request) {
  if (!FRONT_DESK_ENABLED) return Response.json({ error: "Not found." }, { status: 404 }); // paused (lib/features.ts)
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { kind } = ((await request.json().catch(() => ({}))) ?? {}) as { kind?: unknown };
  if (kind !== undefined && (typeof kind !== "string" || !Object.hasOwn(SAMPLE_TRANSCRIPTS, kind))) {
    return Response.json({ error: "Unknown sample." }, { status: 400 });
  }
  const k: SampleKind = (kind as SampleKind | undefined) ?? "booking";
  return Response.json(await simulateVoicemail(k));
}
