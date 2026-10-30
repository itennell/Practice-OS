-- 037: the Front Desk inbox (one timeline of calls, voicemails, texts, bookings).
--
-- 1. Calls are kept too, not only voicemails: channel 'call' on inquiries and
--    messages, and a 'call' stream in front_desk_sync. A call is keyed by its
--    phone company id like every other message, so a repeat check never adds it twice.
-- 2. messages.meta: what the timeline shows beside a message. For a call:
--    duration and status. For a voicemail: the call and recording ids, length,
--    and the safety result (crisis check category, which private-detail kinds
--    the plain-code check found). Never the words again; those stay in body.
-- 3. vendor 'sample': [Sample] voicemails made by "Simulate a voicemail". They
--    run the real pipeline but can never text anyone.

alter table practice_os.inquiries drop constraint inquiries_channel_check;
alter table practice_os.inquiries add constraint inquiries_channel_check
  check (channel in ('voicemail', 'sms', 'web_chat', 'call'));

alter table practice_os.messages drop constraint messages_channel_check;
alter table practice_os.messages add constraint messages_channel_check
  check (channel in ('voicemail', 'sms', 'web_chat', 'call'));

alter table practice_os.messages add column meta jsonb not null default '{}'::jsonb
  check (jsonb_typeof(meta) = 'object');

alter table practice_os.messages drop constraint messages_vendor_check;
alter table practice_os.messages add constraint messages_vendor_check
  check (vendor in ('spruce', 'twilio', 'quo', 'web', 'sample'));

alter table practice_os.front_desk_sync drop constraint front_desk_sync_stream_check;
alter table practice_os.front_desk_sync add constraint front_desk_sync_stream_check
  check (stream in ('voicemail', 'sms', 'call'));

create index messages_created_idx on practice_os.messages (created_at desc);
