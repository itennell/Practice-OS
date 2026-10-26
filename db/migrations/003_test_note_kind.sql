-- 003: allow the test_note approval kind, used to exercise the approve flow end to end.
-- Its executor (lib/executors/test_note.ts) only writes one line to audit_log.

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note'
));
