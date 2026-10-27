-- Demo data: the fictional Dana Reyes practice (AGENTS.md > Rules). Every row is [Sample].
-- Run by `npm run db:reset` after it empties the demo tables. Fixed ids keep links stable;
-- dates are relative to today so deadlines and bookings stay upcoming.

insert into practice_os.clinician_profile
  (id, full_name, credential, practice_name, neighborhood, city, state, practice_stage, license_line,
   onboarding_answers, onboarding_completed_at, is_sample)
values (
  '00000000-0000-4000-8000-000000000001',
  'Dana Reyes', 'LCPC', 'Reyes Counseling PLLC', 'Lincoln Park', 'Chicago', 'IL', 'beginning',
  'Dana Reyes, LCPC (fictional demo practice)',
  '{
    "note": "[Sample] Fictional demo practice",
    "who_i_help": "[Sample] Adults in Chicago going through work stress and life transitions",
    "how_i_work": "[Sample] Telehealth across Illinois and in person in Lincoln Park, weekday evenings",
    "fees": "[Sample] Self-pay $150 per session; superbills for out-of-network reimbursement",
    "insurance": "[Sample] Not in network yet; credentialing planned",
    "stage": "beginning"
  }'::jsonb,
  now(), true
);

-- Settings are never reset: only created if missing.
insert into practice_os.settings (id) values (true) on conflict (id) do nothing;

-- Obligations come from the compliance rules: scripts/db-reset.ts writes Dana's
-- compliance_facts (lib/compliance/demo.ts) and builds her calendar after this file.

-- Made-up referral sources (never real NPPES providers).
insert into practice_os.referral_sources
  (id, name, organization, taxonomy, city, state, email, stage, last_contacted_at, next_follow_up_on, notes, is_sample) values
  ('00000000-0000-4000-8000-000000000201', '[Sample] Lakeview Family Medicine', '[Sample] Lakeview Family Medicine',
   'Family Medicine', 'Chicago', 'IL', 'frontdesk@example.com', 'found', null, null, '[Sample] Near the office.', true),
  ('00000000-0000-4000-8000-000000000202', '[Sample] Dr. Alex Example', '[Sample] North Side Internal Medicine',
   'Internal Medicine', 'Chicago', 'IL', 'alex@example.com', 'contacted', now() - interval '8 days', current_date + 6,
   '[Sample] Sent intro letter.', true),
  ('00000000-0000-4000-8000-000000000203', '[Sample] Old Town OB-GYN', '[Sample] Old Town OB-GYN',
   'Obstetrics & Gynecology', 'Chicago', 'IL', 'office@example.com', 'follow_up', now() - interval '20 days', current_date,
   '[Sample] Follow-up due today.', true),
  ('00000000-0000-4000-8000-000000000204', '[Sample] Lincoln Park Pediatrics', '[Sample] Lincoln Park Pediatrics',
   'Pediatrics', 'Chicago', 'IL', 'hello@example.com', 'connected', now() - interval '35 days', null,
   '[Sample] Happy to share referrals for parents.', true);

insert into practice_os.posts (id, topic, caption, status, is_sample) values
  ('00000000-0000-4000-8000-000000000301', 'first_session',
   E'[Sample] What happens at a first session? We go over paperwork, scheduling and fees, and you can ask any questions about how sessions work.\n\nDana Reyes, LCPC (fictional demo practice)',
   'pending_approval', true),
  ('00000000-0000-4000-8000-000000000302', 'fees_superbills',
   E'[Sample] Paying out of network? We can give you a superbill to send to your insurance for possible reimbursement.\n\nDana Reyes, LCPC (fictional demo practice)',
   'draft', true),
  ('00000000-0000-4000-8000-000000000303', 'how_to_book',
   E'[Sample] Booking a free 15-minute consult takes a minute: call or text the practice number and pick a time.\n\nDana Reyes, LCPC (fictional demo practice)',
   'idea', true);

insert into practice_os.inquiries (id, channel, contact_name, contact_phone, contact_email, summary, status, ai_disclosed_at, is_sample) values
  ('00000000-0000-4000-8000-000000000401', 'voicemail', '[Sample] Sam Example', '+13125550101', null,
   '[Sample] Wants to book a consultation.', 'booked', now() - interval '2 days', true),
  ('00000000-0000-4000-8000-000000000402', 'sms', '[Sample] Riley Example', '+13125550102', null,
   '[Sample] Asked about superbills and availability.', 'new', now() - interval '3 hours', true),
  ('00000000-0000-4000-8000-000000000403', 'web_chat', '[Sample] Jordan Example', null, 'jordan@example.com',
   '[Sample] Asked whether couples sessions are offered.', 'needs_clinician', now() - interval '1 day', true);

insert into practice_os.messages (id, inquiry_id, direction, channel, body, created_at, is_sample) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000401', 'inbound', 'voicemail',
   '[Sample] Hi, this is Sam. I''d like to book a consultation. My number is 555-0101. Thanks.', now() - interval '2 days', true),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000401', 'outbound', 'sms',
   '[Sample] Hi Sam, this is the AI assistant for Reyes Counseling. Open consult times: Tue 6:00 PM, Wed 6:30 PM, Thu 5:30 PM. Reply with the one that works.',
   now() - interval '2 days' + interval '2 minutes', true),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000401', 'inbound', 'sms',
   '[Sample] Wed works.', now() - interval '2 days' + interval '20 minutes', true),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000402', 'inbound', 'sms',
   '[Sample] Hi, do you give superbills? And do you have evening times?', now() - interval '3 hours', true),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000403', 'inbound', 'web_chat',
   '[Sample] Do you offer couples sessions?', now() - interval '1 day', true),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000403', 'outbound', 'web_chat',
   '[Sample] Hi, I''m the AI assistant for Reyes Counseling. I''ll pass that question to Dana and she''ll reply by email.',
   now() - interval '1 day' + interval '1 minute', true);

insert into practice_os.consult_bookings (id, inquiry_id, calcom_booking_uid, starts_at, ends_at, status, contact_name, contact_phone, is_sample) values
  ('00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000401', 'sample-booking-1',
   ((current_date + 2) + time '18:30') at time zone 'America/Chicago',
   ((current_date + 2) + time '18:45') at time zone 'America/Chicago',
   'booked', '[Sample] Sam Example', '+13125550101', true);

insert into practice_os.faqs (id, question, answer, sort_order, is_sample) values
  ('00000000-0000-4000-8000-000000000701', '[Sample] How much is a session?',
   '[Sample] Sessions are $150, paid at the time of the session.', 1, true),
  ('00000000-0000-4000-8000-000000000702', '[Sample] Do you take insurance?',
   '[Sample] Not yet. We can give you a superbill to submit for possible out-of-network reimbursement.', 2, true),
  ('00000000-0000-4000-8000-000000000703', '[Sample] Do you offer telehealth?',
   '[Sample] Yes, for clients located in Illinois, plus in-person sessions in Lincoln Park.', 3, true),
  ('00000000-0000-4000-8000-000000000704', '[Sample] How do I book a consult?',
   '[Sample] Call or text the practice number, or use the chat on the website, and pick a free 15-minute consult time.', 4, true);

insert into practice_os.alerts (id, kind, inquiry_id, message, is_sample) values
  ('00000000-0000-4000-8000-000000000801', 'deadline', null, '[Sample] CAQH re-attestation is due in 21 days.', true),
  ('00000000-0000-4000-8000-000000000802', 'question', '00000000-0000-4000-8000-000000000403',
   '[Sample] Jordan Example asked whether you offer couples sessions.', true);

-- Three pending approvals, one per helper that acts outside the app.
insert into practice_os.approvals (id, kind, title, preview, payload, created_by, is_sample) values
  ('00000000-0000-4000-8000-000000000901', 'referral_letter',
   '[Sample] Intro letter to Lakeview Family Medicine',
   '{"to": "Your test inbox (Gmail draft)", "subject": "[Sample] Introducing Reyes Counseling in Lincoln Park",
     "excerpt": "[Sample] I recently opened a private practice near your office and wanted to introduce myself..."}'::jsonb,
   '{"referral_source_id": "00000000-0000-4000-8000-000000000201", "delivery": "gmail_draft_to_test_inbox"}'::jsonb,
   'aeon:referrals', true),
  ('00000000-0000-4000-8000-000000000902', 'instagram_post',
   '[Sample] Post: What happens at a first session',
   '{"caption_excerpt": "[Sample] What happens at a first session? We go over paperwork, scheduling and fees...", "account": "@practiceos_"}'::jsonb,
   '{"post_id": "00000000-0000-4000-8000-000000000301"}'::jsonb,
   'aeon:instagram', true),
  ('00000000-0000-4000-8000-000000000903', 'sms_reply',
   '[Sample] Text Riley Example open consult times',
   '{"to": "[Sample] Riley Example", "body": "[Sample] Hi Riley, this is the AI assistant for Reyes Counseling. Yes, superbills are available. Open consult times: Tue 6:00 PM, Thu 5:30 PM."}'::jsonb,
   '{"inquiry_id": "00000000-0000-4000-8000-000000000402", "delivery": "sms_to_verified_test_phone"}'::jsonb,
   'aeon:front_desk', true),
  ('00000000-0000-4000-8000-000000000904', 'test_note',
   '[Sample] Test note: hello from Aeon',
   '{"note": "[Sample] Hello from Aeon. Approving this only writes one line to the audit log."}'::jsonb,
   '{"note": "[Sample] Hello from Aeon. Approving this only writes one line to the audit log."}'::jsonb,
   'aeon', true),
  ('00000000-0000-4000-8000-000000000905', 'test_note',
   '[Sample] Test note: this one fails on purpose',
   '{"note": "[Sample] Approving this shows what a failed action looks like."}'::jsonb,
   '{"note": "[Sample] Approving this shows what a failed action looks like.", "fail": true}'::jsonb,
   'aeon', true);

insert into practice_os.audit_log (actor, action, details)
values ('system', 'demo_data_seeded', '{"practice": "Reyes Counseling PLLC (fictional demo practice)"}'::jsonb);
