import { canDecide } from "@/lib/admin-guard";
import { markGiven } from "@/lib/superbill/store";
import { isUuid } from "../../../approvals/responses";

// She pressed "Mark given": she handed the superbill to the client herself.
export async function POST(request: Request, ctx: RouteContext<"/api/superbills/[id]/given">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown superbill." }, { status: 404 });
  const sb = await markGiven(id, "clinician");
  if (!sb) return Response.json({ error: "Unknown superbill." }, { status: 404 });
  return Response.json({ reference: sb.reference, issued_on: sb.issued_on });
}
