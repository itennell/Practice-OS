// Every approval kind the database accepts (practice_os.approvals CHECK, latest
// migration). tests/db.test.ts fails if this list and the CHECK ever differ.
export const APPROVAL_KINDS = [
  "referral_letter",
  "instagram_post",
  "sms_reply",
  "consult_booking",
  "consult_reschedule",
  "consult_cancel",
  "web_chat_reply",
  "test_note",
  "state_rules",
] as const;

export type ApprovalKind = (typeof APPROVAL_KINDS)[number];
