// Every approval kind the app queues. The database CHECK (practice_os.approvals,
// latest migration) still allows the removed Media and Front Desk kinds; no code
// queues them. tests/db.test.ts fails if a kind here is missing from the CHECK.
export const APPROVAL_KINDS = [
  "referral_letter",
  "test_note",
  "state_rules",
  "gfe_issue",
  "aeon_action",
  // Chat documents (migration 018)
  "file_document",
  // Referrals calendar: a meeting Aeon planned (migration 047)
  "referral_meeting",
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
