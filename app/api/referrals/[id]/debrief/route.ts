import { canDecide } from "@/lib/admin-guard";
import { isLocalAppRequest, isSameOrigin } from "@/lib/request-guard";
import { analyzeDebrief, checkRecording, DebriefError, MAX_DEBRIEF_BYTES, type DebriefStep } from "@/lib/referrals/debrief";
import { debriefStandin, standinChat, standinTranscribe } from "@/lib/referrals/debrief-standin";
import { isUuid } from "../../../approvals/responses";

// "Debrief my coffee meeting": her recording (a mono 16-bit WAV, at most 3
// minutes) in, a draft profile for her review out, one JSON event per line so
// the card can show each step as it happens. The audio stays in this request's
// memory (never on disk); nothing but audit counts is saved until she confirms
// (./save/route.ts). Clinician only, like dictation.
export const maxDuration = 300;

type Event = { type: "step"; step: DebriefStep } | { type: "result"; result: unknown } | { type: "error"; why: string } | { type: "end" };

export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/debrief">) {
  const allowed = canDecide(request) && (process.env.VERCEL ? isSameOrigin(request) : isLocalAppRequest(request));
  if (!allowed) return Response.json({ error: "Debriefs aren't available here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_DEBRIEF_BYTES + 64 * 1024) return Response.json({ error: "That recording is over 3 minutes. Keep a debrief under 3 minutes." }, { status: 413 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return Response.json({ error: "No recording was sent." }, { status: 400 });
  if (audio.size > MAX_DEBRIEF_BYTES) return Response.json({ error: "That recording is over 3 minutes. Keep a debrief under 3 minutes." }, { status: 413 });
  const bytes = Buffer.from(await audio.arrayBuffer());
  // Over 3 minutes (read from the WAV header) or not a WAV: refused before anything runs.
  try {
    checkRecording(bytes);
  } catch (err) {
    bytes.fill(0);
    if (err instanceof DebriefError) return Response.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const standin = debriefStandin();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (e: Event) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await analyzeDebrief(id, { audio: bytes }, {
          by: "clinician",
          onStep: (step) => send({ type: "step", step }),
          ...(standin ? { transcribe: standinTranscribe, chat: standinChat as never } : {}),
        });
        send({ type: "result", result });
      } catch (err) {
        if (!(err instanceof DebriefError)) console.error("debrief failed", err instanceof Error ? err.message : String(err));
        send({ type: "error", why: err instanceof DebriefError ? err.message : "Aeon couldn't read that debrief. Try again." });
      } finally {
        bytes.fill(0);
        send({ type: "end" });
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
