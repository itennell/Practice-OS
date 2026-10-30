import { CONTACT_KINDS, logContact, type ContactKind } from "@/lib/referrals/contacts";
import { canChange } from "@/lib/referrals/http";
import { cardView } from "@/lib/referrals/plan";
import { isUuid } from "../../../approvals/responses";

// She logged a contact on a card: called, emailed, met, sent the letter, they
// replied, a note, or they referred someone (a date only).
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/contacts">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; happened_on?: unknown; note?: unknown; follow_up_on?: unknown };
  if (!CONTACT_KINDS.includes(body.kind as ContactKind)) return Response.json({ error: "Pick what you did." }, { status: 400 });
  const day = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  try {
    await logContact(id, {
      kind: body.kind as ContactKind,
      happenedOn: day(body.happened_on),
      note: typeof body.note === "string" ? body.note : null,
      followUpOn: day(body.follow_up_on),
      by: "clinician",
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save that." }, { status: 400 });
  }
  const view = await cardView(id);
  return view ? Response.json(view) : Response.json({ error: "Unknown card." }, { status: 404 });
}
