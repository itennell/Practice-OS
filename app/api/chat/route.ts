import { after } from "next/server";
import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { APPROVAL_MODES } from "@/lib/approval-policy";
import { sendMessage } from "@/lib/aeon/chat";
import { DEMO_RESTING, demoCapReached, isViewOnly } from "@/lib/aeon/demo";
import { reflectIfDue } from "@/lib/aeon/reflect";
import { MAX_PICKED } from "@/lib/referrals/ask-context";
import { isUuid } from "../approvals/responses";

// One message to Aeon. The crisis check and the sensitive-info guard run before
// any model call (lib/aeon/agent.ts); a refused or crisis message is stored nowhere.
// `context` (the Referrals Ask Aeon box): the tab and picked partners, added under her
// words for the model only (lib/referrals/ask-context.ts), never saved with her message.
// `stream: true` answers as one JSON event per line: progress lines while Aeon works
// ("Checking partner 2 of 3…"), then the result.
export const maxDuration = 120;

const body = z.object({
  conversationId: z.string().nullable().optional(),
  text: z.string().trim().min(1, "Type a message first.").max(4000, "That message is too long. Keep it under 4,000 characters."),
  /** The mode under the chat box. Bypass needs ADMIN_PASSWORD on the Vercel copy. */
  mode: z.enum(APPROVAL_MODES).optional(),
  context: z
    .object({
      // Cut and cleaned again by contextSuffix (control characters out, caps, JSON quoting).
      tab: z.string().max(200),
      picked: z.array(z.object({ id: z.string().max(200), name: z.string().max(500) })).max(MAX_PICKED * 4),
    })
    .optional(),
  stream: z.boolean().optional(),
});

type Event = { type: "progress"; label: string } | { type: "result"; conversationId: string | null; reply: unknown } | { type: "error"; error: string; status: number };

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { conversationId, text, context, stream } = parsed.data;
  const mode = parsed.data.mode === "bypass" && !canDecide(request) ? "auto" : parsed.data.mode;
  if (conversationId && !isUuid(conversationId)) return Response.json({ error: "Unknown conversation." }, { status: 404 });
  if (await demoCapReached()) {
    return Response.json({ conversationId: conversationId ?? null, reply: { kind: "answer", text: DEMO_RESTING, steps: [], approvalIds: [] } });
  }
  const viewOnly = isViewOnly(request);
  const failed = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chat] ${message}`);
    if (message === "No conversation with that id.") return { error: "That conversation no longer exists.", status: 404 };
    return { error: "Aeon couldn't answer just now. Try again in a minute.", status: 502 };
  };

  if (!stream) {
    try {
      const result = await sendMessage({ conversationId, text, viewOnly, mode, context });
      // Aeon's reflection pass on every 10th message she sends, after she has her reply.
      if (result.conversationId && !viewOnly) {
        const id = result.conversationId;
        after(() => reflectIfDue(id).catch((err) => console.error(`[reflect] ${err instanceof Error ? err.message : String(err)}`)));
      }
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      const f = failed(err);
      return Response.json({ error: f.error }, { status: f.status });
    }
  }

  // The reflection pass is registered now (after() needs the request) and runs once the answer is saved.
  let saved!: (id: string | null) => void;
  const savedId = new Promise<string | null>((resolve) => (saved = resolve));
  after(async () => {
    const id = await savedId;
    if (id && !viewOnly) await reflectIfDue(id).catch((err) => console.error(`[reflect] ${err instanceof Error ? err.message : String(err)}`));
  });
  const encoder = new TextEncoder();
  const out = new ReadableStream<Uint8Array>({
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
        const result = await sendMessage({ conversationId, text, viewOnly, mode, context, onProgress: (label) => send({ type: "progress", label }) });
        saved(result.conversationId);
        send({ type: "result", ...result });
      } catch (err) {
        saved(null);
        send({ type: "error", ...failed(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by the browser going away.
        }
      }
    },
  });
  return new Response(out, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
