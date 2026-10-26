-- 001_init: the practice_os schema and every table Practice-OS needs.
-- Only touches schema practice_os (AGENTS.md > Architecture).

create schema if not exists practice_os;

-- Supabase's public API roles get nothing here. The app connects as the
-- database owner through DATABASE_URL; RLS with no policies blocks everyone else.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on schema practice_os from anon;
    alter default privileges in schema practice_os revoke all on tables from anon;
    alter default privileges in schema practice_os revoke all on sequences from anon;
    alter default privileges in schema practice_os revoke all on functions from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke all on schema practice_os from authenticated;
    alter default privileges in schema practice_os revoke all on tables from authenticated;
    alter default privileges in schema practice_os revoke all on sequences from authenticated;
    alter default privileges in schema practice_os revoke all on functions from authenticated;
  end if;
end $$;
revoke all on schema practice_os from public;

-- Keeps updated_at current on every UPDATE.
create or replace function practice_os.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- The clinician and her settings
-- ---------------------------------------------------------------------------

-- One row: the clinician this install belongs to.
create table practice_os.clinician_profile (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  full_name text not null,
  credential text not null check (credential in ('LCSW', 'LCPC', 'LMFT', 'Psychologist')),
  practice_name text not null,
  neighborhood text,
  city text not null default 'Chicago',
  state text not null default 'IL' check (state = 'IL'),
  practice_stage text not null check (practice_stage in ('beginning', 'middle', 'late')),
  license_line text not null,            -- the exact line used on posts
  onboarding_answers jsonb not null default '{}'::jsonb,
  onboarding_completed_at timestamptz,
  headshot_path text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row: preferences, including which approval kinds run without asking.
create table practice_os.settings (
  id boolean primary key default true check (id),
  auto_approve_kinds text[] not null default '{}',
  timezone text not null default 'America/Chicago',
  helpers_enabled jsonb not null default '{"admin": true, "referrals": true, "instagram": true, "front_desk": true}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Stored sign-ins for outside services (Instagram, Gmail). Never reset.
create table practice_os.connections (
  provider text primary key check (provider in ('instagram', 'gmail', 'calcom', 'twilio')),
  account_label text,
  access_token text,
  refresh_token text,
  scopes text[] not null default '{}',
  expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Approvals and the audit trail
-- ---------------------------------------------------------------------------

-- Everything that sends, posts or books waits here first.
create table practice_os.approvals (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in (
    'referral_letter',      -- becomes a Gmail draft to the test inbox
    'instagram_post',
    'sms_reply',            -- text a caller (e.g. consult options)
    'consult_booking',
    'consult_reschedule',
    'consult_cancel',
    'web_chat_reply'
  )),
  title text not null,
  preview jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed', 'rejected')),
  created_by text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  result jsonb,
  error text,
  is_sample boolean not null default false,
  check ((status = 'pending') = (decided_at is null))
);
create index approvals_pending_idx on practice_os.approvals (created_at) where status = 'pending';

-- Append-only record of every decision and every safety event.
create table practice_os.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor text not null,                  -- clinician, aeon, safety, system
  action text not null,
  approval_id uuid,                      -- no foreign key: history outlives the row
  subject_type text,
  subject_id text,
  details jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on practice_os.audit_log (at desc);

create or replace function practice_os.audit_log_is_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'practice_os.audit_log is append-only (% blocked)', tg_op;
end $$;

create trigger audit_log_no_update_delete
  before update or delete on practice_os.audit_log
  for each row execute function practice_os.audit_log_is_append_only();
create trigger audit_log_no_truncate
  before truncate on practice_os.audit_log
  for each statement execute function practice_os.audit_log_is_append_only();

-- ---------------------------------------------------------------------------
-- Admin helper
-- ---------------------------------------------------------------------------

create table practice_os.obligations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in (
    'license_renewal', 'ce_hours', 'caqh_reattestation', 'medicare_revalidation',
    'pllc_annual_report', 'quarterly_taxes', 'other'
  )),
  due_on date not null,
  recurrence text not null default 'none'
    check (recurrence in ('none', 'quarterly', 'every_120_days', 'annual', 'biennial', 'every_5_years')),
  status text not null default 'upcoming' check (status in ('upcoming', 'done', 'snoozed')),
  notes text,
  source_url text,
  completed_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index obligations_due_idx on practice_os.obligations (due_on) where status = 'upcoming';

-- ---------------------------------------------------------------------------
-- Referrals helper
-- ---------------------------------------------------------------------------

create table practice_os.referral_sources (
  id uuid primary key default gen_random_uuid(),
  npi text unique check (npi ~ '^[0-9]{10}$'),
  name text not null,
  organization text,
  taxonomy text,
  address text,
  city text,
  state text,
  zip text,
  phone text,
  email text,
  stage text not null default 'found'
    check (stage in ('found', 'contacted', 'follow_up', 'connected', 'not_a_fit')),
  last_contacted_at timestamptz,
  next_follow_up_on date,
  notes text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Instagram helper
-- ---------------------------------------------------------------------------

create table practice_os.posts (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in ('first_session', 'fees_superbills', 'how_to_book', 'meet_the_clinician', 'other')),
  caption text not null,
  image_path text,
  status text not null default 'draft'
    check (status in ('idea', 'draft', 'pending_approval', 'scheduled', 'published', 'blocked')),
  blocked_reason text,
  scheduled_for timestamptz,
  published_at timestamptz,
  ig_media_id text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'blocked') = (blocked_reason is not null))
);

-- ---------------------------------------------------------------------------
-- Front Desk helper
-- ---------------------------------------------------------------------------

create table practice_os.inquiries (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('voicemail', 'sms', 'web_chat')),
  contact_name text,
  contact_phone text,
  contact_email text,
  summary text,
  status text not null default 'new'
    check (status in ('new', 'options_sent', 'booked', 'needs_clinician', 'closed')),
  crisis_flag boolean not null default false,
  ai_disclosed_at timestamptz,          -- when the front desk said it is an AI assistant
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table practice_os.messages (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references practice_os.inquiries (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  channel text not null check (channel in ('voicemail', 'sms', 'web_chat')),
  body text not null,
  audio_path text,
  provider_sid text unique,             -- Twilio message or recording SID
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index messages_inquiry_idx on practice_os.messages (inquiry_id, created_at);

create table practice_os.consult_bookings (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid references practice_os.inquiries (id) on delete set null,
  calcom_booking_uid text unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'rescheduled', 'cancelled', 'completed', 'no_show')),
  contact_name text,
  contact_phone text,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table practice_os.faqs (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  active boolean not null default true,
  sort_order int not null default 0,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Things the clinician must see now: crisis alerts, deadlines, unanswered questions.
create table practice_os.alerts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('crisis', 'deadline', 'question', 'system')),
  inquiry_id uuid references practice_os.inquiries (id) on delete set null,
  message text not null,
  sent_at timestamptz,
  acknowledged_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index alerts_open_idx on practice_os.alerts (created_at) where acknowledged_at is null;

-- ---------------------------------------------------------------------------
-- Model usage (one row per Meta API call)
-- ---------------------------------------------------------------------------

create table practice_os.model_calls (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  model text not null,
  feature text not null,
  tokens int,
  ms int not null,
  ok boolean not null
);
create index model_calls_at_idx on practice_os.model_calls (at desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers and row-level security
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'clinician_profile', 'settings', 'connections', 'obligations', 'referral_sources',
    'posts', 'inquiries', 'consult_bookings', 'faqs'
  ] loop
    execute format(
      'create trigger %I before update on practice_os.%I for each row execute function practice_os.touch_updated_at()',
      t || '_touch_updated_at', t
    );
  end loop;

  -- RLS on, no policies: only the owner connection (DATABASE_URL) can read or write.
  for t in select tablename from pg_tables where schemaname = 'practice_os' loop
    execute format('alter table practice_os.%I enable row level security', t);
  end loop;
end $$;
