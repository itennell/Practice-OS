-- 042: Grow (Media > Grow): ad and website drafts Aeon writes for her.
--
-- Each row is one draft: a Google Search campaign, a Facebook/Instagram ad set, or
-- her one-page website. Nothing here is ever sent to an ad platform or published:
-- a draft waits for her approval ('ads_campaign' or 'website'), and the executor
-- only marks it ready so the export buttons unlock. She imports, uploads or
-- publishes it herself. No client details: only her practice facts.

create table practice_os.growth_drafts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('google_ads', 'meta_ads', 'website')),
  -- The whole draft (copy, keywords, targeting, budget cap, policy check) as built in lib/growth.
  draft jsonb not null,
  -- The Meta ad picture (1080 x 1080 JPEG); null for the other kinds.
  image_jpeg bytea check (image_jpeg is null or octet_length(image_jpeg) <= 8388608),
  status text not null default 'pending_approval' check (status in ('pending_approval', 'ready', 'declined')),
  policy_ok boolean not null,
  -- No foreign key: `npm run db:reset` empties approvals and this table together.
  approval_id uuid,
  created_by text not null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  -- A draft that failed the policy check is never queued, so it can never be ready.
  check (status <> 'ready' or policy_ok)
);
create index growth_drafts_kind_idx on practice_os.growth_drafts (kind, created_at desc);
alter table practice_os.growth_drafts enable row level security;

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue', 'aeon_action',
  'text_consult_options', 'file_document',
  'ads_campaign', 'website'
));
