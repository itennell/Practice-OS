import { canChange } from "@/lib/referrals/http";
import { DebriefError, saveDebrief } from "@/lib/referrals/debrief";
import { isUuid } from "../../../../approvals/responses";

// She confirmed (and maybe edited) the debrief's review card: save it to the
// partner's card, log the meeting, remember 1-3 practice facts, add suggested
// cards and queue the follow-up email for her approval. Every text is checked again.
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/debrief/save">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = await request.json().catch(() => null);
  try {
    return Response.json(await saveDebrief(id, body, { by: "clinician" }));
  } catch (err) {
    if (err instanceof DebriefError) return Response.json({ error: err.message }, { status: err.status });
    console.error("debrief save failed", err instanceof Error ? err.message : String(err));
    return Response.json({ error: "Couldn't save the debrief. Try again." }, { status: 500 });
  }
}
