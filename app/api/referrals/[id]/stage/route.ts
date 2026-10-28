import { canChange } from "@/lib/referrals/http";
import { moveSource, STAGES, type Stage } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// She moved a card on the Referrals board (drag and drop or the Move to menu).
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/stage">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { stage?: unknown };
  if (!STAGES.includes(body.stage as Stage)) return Response.json({ error: "Unknown column." }, { status: 400 });
  const card = await moveSource(id, body.stage as Stage, "clinician");
  if (!card) return Response.json({ error: "Unknown card." }, { status: 404 });
  return Response.json({ card });
}
