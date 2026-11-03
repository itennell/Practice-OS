import { CONTACT_KINDS, logContact, type ContactKind } from "@/lib/referrals/contacts";
import { canChange } from "@/lib/referrals/http";
import { cardView } from "@/lib/referrals/plan";
import { isUuid } from "../../../approvals/responses";

// She logged a contact on a card: called, emailed, met, sent the letter, they
// replied, a note, they referred someone (a date only), or she referred someone
// to them (a date and a count only).
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/contacts">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { kind?: unknown; happened_on?: unknown; note?: unknown; follow_up_on?: unknown; count?: unknown };
  if (!CONTACT_KINDS.includes(body.kind as ContactKind)) return Response.json({ error: "Pick what you did." }, { status: 400 });
  const day = (v: unknown) => (typeof v === "string" && v ? v : undefined);
  let already = false;
  try {
    ({ already = false } = await logContact(id, {
      kind: body.kind as ContactKind,
      happenedOn: day(body.happened_on),
      note: typeof body.note === "string" ? body.note : null,
      followUpOn: day(body.follow_up_on),
      by: "clinician",
      // referred_out: how many people, nothing else (migration 045).
      count: typeof body.count === "number" ? body.count : null,
    }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save that." }, { status: 400 });
  }
  const view = await cardView(id);
  // already: "I sent it" was pressed again; the board says "Already logged".
  return view ? Response.json({ ...view, ...(already ? { already: true } : {}) }) : Response.json({ error: "Unknown card." }, { status: 404 });
}
