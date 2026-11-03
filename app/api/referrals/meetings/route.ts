import { canChange } from "@/lib/referrals/http";
import { createMeeting, listMeetings, MEETING_KINDS, meetingBlocked, MeetingError, toInstant, type MeetingKind } from "@/lib/referrals/meetings";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../approvals/responses";

// The Referrals calendar. GET ?from&to (ISO instants): the meetings in that range.
// POST: she adds a meeting herself (Aeon's plans go through a referral_meeting
// approval instead). Notes go through the crisis, referral-value and privacy checks.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const range = { from: toInstant(params.get("from"), "the start of the range"), to: toInstant(params.get("to"), "the end of the range") };
    const meetings = await listMeetings(range, { includeCanceled: params.get("canceled") === "1" });
    return Response.json({ meetings }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof MeetingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.source_id !== "string" || !isUuid(body.source_id)) return Response.json({ error: "Pick who the meeting is with." }, { status: 400 });
  if (!MEETING_KINDS.includes(body.kind as MeetingKind)) return Response.json({ error: "Pick coffee, call, meeting, lunch talk or other." }, { status: 400 });
  const source = await getSource(body.source_id);
  if (!source) return Response.json({ error: "That referral source is no longer on the board." }, { status: 404 });
  // Do-not-contact and Not a fit: no meeting is planned with them.
  const blocked = await meetingBlocked(source);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });
  try {
    const { meeting } = await createMeeting({
      sourceId: body.source_id,
      kind: body.kind as MeetingKind,
      startsAt: body.starts_at as string,
      endsAt: typeof body.ends_at === "string" && body.ends_at ? body.ends_at : null,
      location: typeof body.location === "string" ? body.location : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      by: "clinician",
    });
    return Response.json({ meeting }, { status: 201 });
  } catch (err) {
    if (err instanceof MeetingError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
