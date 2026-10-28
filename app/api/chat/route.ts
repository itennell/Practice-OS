import { after } from "next/server";
import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { APPROVAL_MODES } from "@/lib/approval-policy";
import { sendMessage } from "@/lib/aeon/chat";
import { DEMO_RESTING, demoCapReached, isViewOnly } from "@/lib/aeon/demo";
import { reflectIfDue } from "@/lib/aeon/reflect";
import { isUuid } from "../approvals/responses";

// One message to Aeon. The crisis check and the sensitive-info guard run before
// any model call (lib/aeon/agent.ts); a refused or crisis message is stored nowhere.
export const maxDuration = 120;

const body = z.object({
  conversationId: z.string().nullable().optional(),
  text: z.string().trim().min(1, "Type a message first.").max(4000, "That message is too long. Keep it under 4,000 characters."),
  /** The mode under the chat box. Bypass needs ADMIN_PASSWORD on the Vercel copy. */
  mode: z.enum(APPROVAL_MODES).optional(),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Bad request." }, { status: 400 });
  const { conversationId, text } = parsed.data;
  const mode = parsed.data.mode === "bypass" && !canDecide(request) ? "auto" : parsed.data.mode;
  if (conversationId && !isUuid(conversationId)) return Response.json({ error: "Unknown conversation." }, { status: 404 });
  if (await demoCapReached()) {
    return Response.json({ conversationId: conversationId ?? null, reply: { kind: "answer", text: DEMO_RESTING, steps: [], approvalIds: [] } });
  }
  try {
    const viewOnly = isViewOnly(request);
    const result = await sendMessage({ conversationId, text, viewOnly, mode });
    // Aeon's reflection pass on every 10th message she sends, after she has her reply.
    if (result.conversationId && !viewOnly) {
      const id = result.conversationId;
      after(() => reflectIfDue(id).catch((err) => console.error(`[reflect] ${err instanceof Error ? err.message : String(err)}`)));
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[chat] ${message}`);
    if (message === "No conversation with that id.") return Response.json({ error: "That conversation no longer exists." }, { status: 404 });
    return Response.json({ error: "Aeon couldn't answer just now. Try again in a minute." }, { status: 502 });
  }
}
