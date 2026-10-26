import { canDecide } from "@/lib/admin-guard";
import { decline } from "@/lib/approvals";
import { decisionResponse, isUuid } from "../../responses";

export async function POST(request: Request, ctx: RouteContext<"/api/approvals/[id]/decline">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to decline here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown approval." }, { status: 404 });
  return decisionResponse(await decline(id, { by: "clinician" }));
}
