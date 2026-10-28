-- 016: Front Desk on the clinician's own phone company and calendar.
--
-- 1. approvals accept text_consult_options (three consult times by text).
-- 2. messages remember which phone company an id came from (vendor, provider_sid).
-- 3. consult_bookings work with Cal.com or Google and track the day-before
--    reminder. The calendar only ever sees the reference ("Phone consult FD-1042").
-- 4. consult_offers: the times a caller was offered, so a reply of "2" means one slot.
-- 5. front_desk_sync: where each phone stream was last read, and its last error.
-- 6. sms_opt_outs: numbers that texted STOP; nothing is sent to them again.
-- 7. settings: her calendar choice, consult length (Google; Cal.com uses its
--    event type), the voicemail greeting she records in her phone app, and two
--    more Front Desk rules, both on.

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue', 'aeon_action',
  'text_consult_options'
));

alter table practice_os.messages add column vendor text
  check (vendor in ('spruce', 'twilio', 'quo', 'web'));
update practice_os.messages set vendor = 'twilio' where provider_sid is not null;
alter table practice_os.messages drop constraint messages_provider_sid_key;
alter table practice_os.messages add constraint messages_vendor_provider_sid_key
  unique (vendor, provider_sid);

alter table practice_os.consult_bookings
  add column calendar_provider text check (calendar_provider in ('calcom', 'google')),
  add column external_id text,
  add column reference text unique,
  add column reminder_sent_at timestamptz;
update practice_os.consult_bookings
  set calendar_provider = 'calcom', external_id = calcom_booking_uid
  where calcom_booking_uid is not null;
alter table practice_os.consult_bookings drop column calcom_booking_uid;
alter table practice_os.consult_bookings add constraint consult_bookings_external_key
  unique (calendar_provider, external_id);
create index consult_bookings_upcoming_idx on practice_os.consult_bookings (starts_at)
  where status in ('booked', 'rescheduled');

create table practice_os.consult_offers (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references practice_os.inquiries (id) on delete cascade,
  purpose text not null check (purpose in ('book', 'reschedule')),
  booking_id uuid references practice_os.consult_bookings (id) on delete set null,
  slots jsonb not null
    check (jsonb_typeof(slots) = 'array' and jsonb_array_length(slots) between 1 and 3),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'chosen', 'superseded', 'expired')),
  chosen_index int check (chosen_index between 1 and 3),
  sent_at timestamptz,
  expires_at timestamptz,
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index consult_offers_open_idx on practice_os.consult_offers (inquiry_id) where status = 'sent';

create table practice_os.front_desk_sync (
  vendor text not null,
  stream text not null check (stream in ('voicemail', 'sms')),
  last_seen_at timestamptz,
  last_checked_at timestamptz,
  last_error text,
  primary key (vendor, stream)
);

create table practice_os.sms_opt_outs (
  phone text primary key,
  opted_out_at timestamptz not null default now()
);

alter table practice_os.settings
  add column front_desk_calendar text check (front_desk_calendar in ('calcom', 'google')),
  add column front_desk_consult_minutes int not null default 15 check (front_desk_consult_minutes between 10 and 60),
  add column front_desk_greeting text check (char_length(front_desk_greeting) <= 500);
update practice_os.settings
  set front_desk_rules = front_desk_rules || '{"book_by_text": true, "send_reminders": true}'::jsonb;
alter table practice_os.settings alter column front_desk_rules
  set default '{"text_missed_callers": true, "book_by_text": true, "send_reminders": true}'::jsonb;

alter table practice_os.consult_offers enable row level security;
alter table practice_os.front_desk_sync enable row level security;
alter table practice_os.sms_opt_outs enable row level security;
