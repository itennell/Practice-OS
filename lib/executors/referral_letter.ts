import { audit } from "../audit";
import { createDraft, gmailToken } from "../referrals/gmail";
import { checkLetter, FOLLOW_UP_DAYS } from "../referrals/outreach";
import { getSource, markContacted } from "../referrals/store";
import type { Executor } from "./types";

// An approved introduction letter becomes a Gmail DRAFT addressed to the test
// inbox only (TEST_INBOX_EMAIL), never to the real provider found in NPPES.
// Aeon never sends: she opens Gmail and presses send. Then the card moves to
// Contacted with a follow-up a week out. DRY_RUN: no Gmail call; the draft is
// returned in the result for the app to show.
export const referralLetter: Executor = async (approval, { dryRun }) => {
  const { referral_source_id: sourceId, subject, letter } = approval.payload as Record<string, unknown>;
  if (typeof sourceId !== "string" || typeof subject !== "string" || typeof letter !== "string") {
    throw new Error("This letter is missing its referral source, subject or text.");
  }
  // Checked again here: she may have edited it, or another agent queued it.
  const check = checkLetter(letter);
  if (!check.ok) throw new Error(check.reason);
  const source = await getSource(sourceId);
  if (!source) throw new Error("That referral source is no longer on the board.");

  const to = process.env.TEST_INBOX_EMAIL ?? "";
  const draft = { to: to || "(TEST_INBOX_EMAIL not set)", subject, body: letter };
  let gmail: { draftId: string; messageId: string } | null = null;
  if (!dryRun) {
    if (!to) throw new Error("TEST_INBOX_EMAIL isn't set, so there is no test inbox to put the draft in.");
    gmail = await createDraft(await gmailToken(), { to, subject, body: letter });
  }

  const followUpOn = await markContacted(source.id, FOLLOW_UP_DAYS);
  await audit({
    actor: "executor",
    action: dryRun ? "referral_letter_dry_run" : "referral_letter_drafted",
    approvalId: approval.id,
    subjectType: "referral_source",
    subjectId: source.id,
    details: { to: draft.to, subject, gmail_draft_id: gmail?.draftId ?? null, follow_up_on: followUpOn },
  });
  return {
    dry_run: dryRun,
    draft,
    gmail_draft_id: gmail?.draftId ?? null,
    moved_to: "contacted",
    follow_up_on: followUpOn,
    note: dryRun ? "Dry run: no Gmail draft was made. This is what it would say." : "Saved as a Gmail draft in your test inbox. Open Gmail to send it.",
  };
};
