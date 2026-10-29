import { canChange } from "@/lib/referrals/http";
import { draftOutreach } from "@/lib/referrals/outreach";
import { isUuid } from "../../../approvals/responses";

// "Draft email" on a card: Muse writes it, the card shows it to copy, and it waits in Approvals. Sends nothing.
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/draft">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  try {
    const { approvalId, subject, letter } = await draftOutreach(id, { by: "aeon:referrals" });
    return Response.json({ approval_id: approvalId, subject, letter });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "I couldn't write the letter. Try again." }, { status: 502 });
  }
}
