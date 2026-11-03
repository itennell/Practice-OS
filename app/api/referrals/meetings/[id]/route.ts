import { canChange } from "@/lib/referrals/http";
import { cancelMeeting, getMeeting, MEETING_KINDS, MEETING_STATUSES, meetingBlocked, MeetingError, updateMeeting, type MeetingKind, type MeetingStatus, type UpdateInput } from "@/lib/referrals/meetings";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// One meeting on her Referrals calendar. PATCH: move it, change its kind, place,
// note or status (only what is sent changes; null clears the place or note).
// DELETE: cancels it (it stays on the calendar, marked canceled).
export async function PATCH(request: Request, ctx: RouteContext<"/api/referrals/meetings/[id]">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  const had = isUuid(id) ? await getMeeting(id) : null;
  if (!had) return Response.json({ error: "Unknown meeting." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  // A meeting that stays (or becomes) planned needs a card she may still meet: not do-not-contact, not Not a fit.
  // Marking it done or canceled is always allowed.
  if ((body.status ?? had.status) === "planned") {
    const source = await getSource(had.source_id);
    const blocked = source ? await meetingBlocked(source) : "That referral source is no longer on the board.";
    if (blocked) return Response.json({ error: blocked }, { status: 409 });
  }
  const input: UpdateInput = { by: "clinician" };
  if ("kind" in body) {
    if (!MEETING_KINDS.includes(body.kind as MeetingKind)) return Response.json({ error: "Pick coffee, call, meeting, lunch talk or other." }, { status: 400 });
    input.kind = body.kind as MeetingKind;
  }
  if ("status" in body) {
    if (!MEETING_STATUSES.includes(body.status as MeetingStatus)) return Response.json({ error: "Pick planned, done or canceled." }, { status: 400 });
    input.status = body.status as MeetingStatus;
  }
  if (typeof body.starts_at === "string") input.startsAt = body.starts_at;
  if (typeof body.ends_at === "string") input.endsAt = body.ends_at;
  if ("location" in body) input.location = typeof body.location === "string" ? body.location : null;
  if ("notes" in body) input.notes = typeof body.notes === "string" ? body.notes : null;
  try {
    return Response.json({ meeting: await updateMeeting(id, input) });
  } catch (err) {
    if (err instanceof MeetingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/referrals/meetings/[id]">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await getMeeting(id))) return Response.json({ error: "Unknown meeting." }, { status: 404 });
  return Response.json({ meeting: await cancelMeeting(id, "clinician") });
}
