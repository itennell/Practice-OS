import { audit } from "../audit";
import { checkLetter, FOLLOW_UP_DAYS } from "../referrals/outreach";
import { getSource, markContacted } from "../referrals/store";
import type { Executor } from "./types";

// An approved introduction letter: Aeon sends nothing and makes no Gmail draft.
// She copies the letter from the board card, pastes it into her own email and
// sends it herself. Approving records that it went out: the card moves to
// Contacted with a follow-up a week out. The letter is checked again here, in
// case she edited it or another agent queued it.
export const referralLetter: Executor = async (approval, { dryRun }) => {
  const { referral_source_id: sourceId, subject, letter } = approval.payload as Record<string, unknown>;
  if (typeof sourceId !== "string" || typeof subject !== "string" || typeof letter !== "string") {
    throw new Error("This letter is missing its referral source, subject or text.");
  }
  const check = checkLetter(letter);
  if (!check.ok) throw new Error(check.reason);
  const source = await getSource(sourceId);
  if (!source) throw new Error("That referral source is no longer on the board.");

  const followUpOn = await markContacted(source.id, FOLLOW_UP_DAYS);
  await audit({
    actor: "executor",
    action: "referral_letter_approved",
    approvalId: approval.id,
    subjectType: "referral_source",
    subjectId: source.id,
    details: { subject, follow_up_on: followUpOn, dry_run: dryRun },
  });
  return {
    dry_run: dryRun,
    letter: { subject, body: letter },
    moved_to: "contacted",
    follow_up_on: followUpOn,
    note: "Copy it from the Referrals board, paste it into your own email and send it yourself. Aeon sent nothing.",
  };
};
