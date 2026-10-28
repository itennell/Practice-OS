import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { APPROVAL_MODES } from "@/lib/approval-policy";
import { saveConversationMode } from "@/lib/approval-settings";
import { isUuid } from "../../../approvals/responses";

// The mode pill under the chat box: Manual, Auto or Bypass for this chat.
export async function PUT(request: Request, ctx: RouteContext<"/api/conversations/[id]/mode">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown conversation." }, { status: 404 });
  const parsed = z.object({ mode: z.enum(APPROVAL_MODES) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick Manual, Auto or Bypass." }, { status: 400 });
  const ok = await saveConversationMode(id, parsed.data.mode, "clinician");
  return ok ? Response.json({ mode: parsed.data.mode }) : Response.json({ error: "Unknown conversation." }, { status: 404 });
}
