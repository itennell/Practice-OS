-- 018: Documents she adds in the chat (chat documents, PR 2).
--
-- A business document she drops into the chat (a payer contract, fee schedule,
-- board or licensing letter, malpractice face sheet, W-9 or CE certificate) is
-- kept on her own computer under PRACTICE_OS_DATA_DIR/documents/ and indexed
-- here, so Aeon can find and open it later. The file itself is never stored in
-- the database. Client records are refused before anything is written, so no
-- row here ever describes a client. What the file says only changes her
-- records through a 'file_document' approval.

create table practice_os.documents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'payer_contract', 'fee_schedule', 'board_letter', 'malpractice', 'w9', 'ce_certificate', 'other_business'
  )),
  title text not null check (length(title) between 1 and 160),
  mime text not null check (mime in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  )),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  sha256 text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  -- Relative to PRACTICE_OS_DATA_DIR; the name is the row's own id, never her filename.
  stored_as text not null unique check (stored_as ~ '^documents/[0-9a-f-]{36}\.(pdf|docx|txt)$'),
  summary text check (length(summary) <= 400),
  payer text check (length(payer) <= 120),
  status text not null default 'kept' check (status in ('kept', 'filed')),
  -- No foreign key: `npm run db:reset` empties approvals but never her documents.
  approval_id uuid,
  created_by text not null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index documents_created_idx on practice_os.documents (created_at desc);
alter table practice_os.documents enable row level security;

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue', 'aeon_action',
  'text_consult_options', 'file_document'
));
