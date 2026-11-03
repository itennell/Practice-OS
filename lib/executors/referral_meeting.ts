import { audit } from "../audit";
import { practiceTimeZone } from "../compliance/store";
import { createMeeting, MEETING_KINDS, MEETING_LABEL, meetingBlocked, meetingLabel, type MeetingKind } from "../referrals/meetings";
import { getSource } from "../referrals/store";
import type { Executor } from "./types";

// An approved referral meeting (plan_referral_meeting, lib/aeon/tools-meetings.ts):
// puts it on her Referrals calendar. Nothing is sent and no invite goes out; she
// tells the partner herself. The note is checked again here (createMeeting runs
// the crisis, referral-value and privacy checks), in case another agent queued
// it. A retried approval returns the meeting it already made.
//
// DRY_RUN: the row is still saved. It only touches her own calendar on this
// computer, and nothing leaves it.
export const referralMeeting: Executor = async (approval, { dryRun }) => {
  const p = approval.payload as Record<string, unknown>;
  const sourceId = p.referral_source_id;
  const kind = p.kind as MeetingKind;
  if (typeof sourceId !== "string" || typeof p.starts_at !== "string" || typeof p.ends_at !== "string" || !MEETING_KINDS.includes(kind)) {
    throw new Error("This meeting is missing its referral source, kind or time.");
  }
  const source = await getSource(sourceId);
  if (!source) throw new Error("That referral source is no longer on the board.");
  // Marked do-not-contact or Not a fit after Aeon planned it: it never goes on the calendar.
  const blocked = await meetingBlocked(source);
  if (blocked) throw new Error(blocked);

  const { meeting, already } = await createMeeting({
    sourceId,
    kind,
    startsAt: p.starts_at,
    endsAt: p.ends_at,
    location: typeof p.location === "string" ? p.location : null,
    notes: typeof p.notes === "string" ? p.notes : null,
    by: "executor",
    approvalId: approval.id,
  });
  if (!already) {
    await audit({ actor: "executor", action: "referral_meeting_approved", approvalId: approval.id, subjectType: "referral_source", subjectId: sourceId, details: { meeting_id: meeting.id, kind, dry_run: dryRun } });
  }
  const tz = await practiceTimeZone();
  return {
    dry_run: dryRun,
    meeting_id: meeting.id,
    ...(already ? { already: true } : {}),
    note: `${MEETING_LABEL[kind]} with ${source.name} is on your Referrals calendar for ${meetingLabel(meeting.starts_at, tz)}. Aeon sent nothing: let them know yourself.`,
  };
};
