import { canDecide } from "@/lib/admin-guard";
import { approve } from "@/lib/approvals";
import { decisionResponse, isUuid } from "../../responses";

export async function POST(request: Request, ctx: RouteContext<"/api/approvals/[id]/approve">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to approve here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown approval." }, { status: 404 });

  let edit: string | undefined;
  if (request.headers.get("content-type")?.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as { edit?: unknown };
    if (body.edit !== undefined) {
      if (typeof body.edit !== "string") return Response.json({ error: "Edit must be text." }, { status: 400 });
      edit = body.edit;
    }
  }
  return decisionResponse(await approve(id, { by: "clinician", edit }));
}
