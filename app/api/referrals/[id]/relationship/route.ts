import { setFollowUp, setIntroducedBy, suppress, unsuppress } from "@/lib/referrals/contacts";
import { canChange } from "@/lib/referrals/http";
import { cardView } from "@/lib/referrals/plan";
import { isUuid } from "../../../approvals/responses";

// The rest of a card's relationship: who introduced her, the next follow-up
// date, and "don't contact again" (kept by NPI, so a new search skips them).
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/relationship">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  if (!(await cardView(id))) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { introduced_by?: unknown; follow_up_on?: unknown; do_not_contact?: unknown };
  try {
    if ("introduced_by" in body) await setIntroducedBy(id, typeof body.introduced_by === "string" ? body.introduced_by : null);
    if ("follow_up_on" in body) await setFollowUp(id, typeof body.follow_up_on === "string" && body.follow_up_on ? body.follow_up_on : null);
    if (body.do_not_contact === "asked_not_to" || body.do_not_contact === "not_interested") await suppress(id, body.do_not_contact);
    else if (body.do_not_contact === false) await unsuppress(id);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save that." }, { status: 400 });
  }
  return Response.json(await cardView(id));
}
