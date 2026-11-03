-- 047: Referral meetings (the Referrals calendar).
--
-- Coffees, calls, meetings and lunch talks she plans with the people on her
-- Referrals board. Professional facts only: when, where, with which card and
-- her own short note about the meeting. Never anything about a client; the
-- app checks each note with the privacy guard and the referral-value check
-- before saving it. Aeon never writes here directly: plan_referral_meeting
-- queues a referral_meeting approval, and only its executor inserts the row
-- (approval_id, unique, so a retried approval never makes two).
-- Safe to run twice.

create table if not exists practice_os.referral_meetings (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references practice_os.referral_sources (id) on delete cascade,
  kind text not null check (kind in ('coffee', 'call', 'meeting', 'lunch_talk', 'other')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text check (length(location) between 1 and 200),
  notes text check (length(notes) between 1 and 500),
  status text not null default 'planned' check (status in ('planned', 'done', 'canceled')),
  -- The approval that created it (Aeon's plan), or null when she added it herself.
  -- No foreign key: `npm run db:reset` empties approvals and this table together.
  approval_id uuid unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  is_sample boolean not null default false,
  check (ends_at > starts_at),
  check (ends_at <= starts_at + interval '8 hours')
);
create index if not exists referral_meetings_starts_idx on practice_os.referral_meetings (starts_at);
create index if not exists referral_meetings_source_idx on practice_os.referral_meetings (source_id);
alter table practice_os.referral_meetings enable row level security;

alter table practice_os.approvals drop constraint if exists approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue', 'aeon_action',
  'text_consult_options', 'file_document',
  'ads_campaign', 'website',
  'referral_meeting'
));
