import { canChange } from "@/lib/referrals/http";
import { draftOutreach } from "@/lib/referrals/outreach";
import { isUuid } from "../../../approvals/responses";

/** A going-cold card's "Draft a follow-up note": the same letter path, as a short hello. */
const KEEP_IN_TOUCH =
  "A short, friendly keep-in-touch note: it has been a while since we were last in touch. Say hello and remind them who I see. No ask, and nothing offered in return.";

// "Draft email" on a card: Muse writes it, the card shows it to copy, and it waits in Approvals. Sends nothing.
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/draft">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { nudge?: unknown };
  try {
    const { approvalId, subject, letter } = await draftOutreach(id, { by: "aeon:referrals", ...(body.nudge === true ? { note: KEEP_IN_TOUCH } : {}) });
    return Response.json({ approval_id: approvalId, subject, letter });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "I couldn't write the letter. Try again." }, { status: 502 });
  }
}
