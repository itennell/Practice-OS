import { canChange } from "@/lib/referrals/http";
import { cardView } from "@/lib/referrals/plan";
import { logReferralOut, readCount, saveReferOutNotes } from "@/lib/referrals/refer-out";
import { isUuid } from "../../../approvals/responses";

// Referring out from a card. POST: "I referred someone to them", a date and how
// many people, nothing else (no note, no client fields). PUT: her notes about
// them for referring out (their availability, fees and insurance), checked with
// the privacy guard.
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/refer-out">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { count?: unknown; happened_on?: unknown };
  // How many people: a whole number from 1 to 20, said by her. No default.
  const count = readCount(body.count);
  if (count === null) return Response.json({ error: "Say how many people, from 1 to 20." }, { status: 400 });
  try {
    await logReferralOut(id, {
      count,
      happenedOn: typeof body.happened_on === "string" && body.happened_on ? body.happened_on : null,
      by: "clinician",
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save that." }, { status: 400 });
  }
  const view = await cardView(id);
  return view ? Response.json(view) : Response.json({ error: "Unknown card." }, { status: 404 });
}

export async function PUT(request: Request, ctx: RouteContext<"/api/referrals/[id]/refer-out">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const field = (k: string) => (typeof body[k] === "string" ? (body[k] as string) : body[k] === null ? null : undefined);
  try {
    const notes = await saveReferOutNotes(id, { availability: field("availability"), fees: field("fees"), insurance: field("insurance") });
    return Response.json({ notes });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save that." }, { status: 400 });
  }
}
