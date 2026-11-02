import { audit } from "../audit";
import { blockedReason, checkLetter } from "../referrals/outreach";
import { getSource } from "../referrals/store";
import type { Executor } from "./types";

// An approved introduction letter: Aeon sends nothing and makes no Gmail draft.
// Approving only makes it ready: she copies the letter from the board card,
// pastes it into her own email and sends it herself. The card stays where it is
// (showing "Letter ready") until she marks it sent ("I sent it" on the card, or
// telling Aeon), which logs sent_letter and moves it to Contacted with a
// follow-up a week out (lib/referrals/contacts.ts). The letter is checked
// again here, in case she edited it or another agent queued it.
export const referralLetter: Executor = async (approval, { dryRun }) => {
  const { referral_source_id: sourceId, subject, letter } = approval.payload as Record<string, unknown>;
  if (typeof sourceId !== "string" || typeof subject !== "string" || typeof letter !== "string") {
    throw new Error("This letter is missing its referral source, subject or text.");
  }
  const check = checkLetter(letter);
  if (!check.ok) throw new Error(check.reason);
  const source = await getSource(sourceId);
  if (!source) throw new Error("That referral source is no longer on the board.");
  // Marked do-not-contact or Not a fit after the letter was drafted: it never becomes ready.
  const blocked = await blockedReason(source);
  if (blocked) throw new Error(blocked);

  await audit({
    actor: "executor",
    action: "referral_letter_approved",
    approvalId: approval.id,
    subjectType: "referral_source",
    subjectId: source.id,
    details: { subject, dry_run: dryRun },
  });
  return {
    dry_run: dryRun,
    letter: { subject, body: letter },
    letter_ready: true,
    moved_to: null,
    note: "Ready to send. Copy it from the Referrals board, paste it into your own email and send it yourself (Aeon sent nothing). Then press I sent it on the card, and it moves to Contacted with a follow-up a week out.",
  };
};
