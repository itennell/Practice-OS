import { canDecide } from "@/lib/admin-guard";
import { deleteConversation, getConversation } from "@/lib/aeon/chat";
import { isUuid } from "../../approvals/responses";

export async function GET(_request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  const { id } = await ctx.params;
  const found = isUuid(id) ? await getConversation(id) : null;
  if (!found) return Response.json({ error: "That conversation no longer exists." }, { status: 404 });
  return Response.json(found, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/conversations/[id]">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to delete here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await deleteConversation(id))) return Response.json({ error: "That conversation no longer exists." }, { status: 404 });
  return Response.json({ ok: true });
}
