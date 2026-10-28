-- Demo data: the fictional Dana Reyes practice (AGENTS.md > Rules). Every row is [Sample].
-- Run by `npm run db:reset` after it empties the demo tables. Fixed ids keep links stable;
-- dates are relative to today so deadlines and bookings stay upcoming.

insert into practice_os.clinician_profile
  (id, full_name, credential, practice_name, neighborhood, city, state, practice_stage, license_line,
   onboarding_answers, onboarding_completed_at, office_hours, fee_schedule, is_sample)
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
  now(),
  -- [Sample] open Monday to Thursday, closed federal holidays: Good Faith Estimate due dates count these days.
  '{"weekdays": [1, 2, 3, 4], "closed_on": [], "close_federal_holidays": true}'::jsonb,
  '[{"code": "90791", "label": "First session (intake)", "cents": 20000},
    {"code": "90834", "label": "Therapy, 38-52 minutes", "cents": 15000},
    {"code": "90837", "label": "Therapy, 53 minutes or longer", "cents": 17500}]'::jsonb,
  true
);

-- Settings are never reset: only created if missing.
insert into practice_os.settings (id) values (true) on conflict (id) do nothing;

-- Obligations come from the compliance rules: scripts/db-reset.ts writes Dana's
-- compliance_facts (lib/compliance/demo.ts) and builds her calendar after this file.

-- Made-up referral sources (never real NPPES providers).
insert into practice_os.referral_sources
  (id, name, organization, taxonomy, specialty, npi_type, city, state, email, stage, last_contacted_at, next_follow_up_on, distance_miles, fit_score, notes, is_sample) values
  ('00000000-0000-4000-8000-000000000201', '[Sample] Lakeview Family Medicine', '[Sample] Lakeview Family Medicine',
   '207Q00000X', 'Family medicine', 'organization', 'Chicago', 'IL', 'frontdesk@example.com', 'found', null, null, 0.6, 81, '[Sample] Near the office.', true),
  ('00000000-0000-4000-8000-000000000202', '[Sample] Dr. Alex Example', '[Sample] North Side Internal Medicine',
   '207R00000X', 'Internal medicine', 'individual', 'Chicago', 'IL', 'alex@example.com', 'contacted', now() - interval '8 days', current_date + 6, 1.4, 77,
   '[Sample] Sent intro letter.', true),
  ('00000000-0000-4000-8000-000000000203', '[Sample] Old Town OB-GYN', '[Sample] Old Town OB-GYN',
   '207V00000X', 'OB/GYN', 'organization', 'Chicago', 'IL', 'office@example.com', 'follow_up', now() - interval '20 days', current_date, 1.1, 69,
   '[Sample] Follow-up due today.', true),
  ('00000000-0000-4000-8000-000000000204', '[Sample] Lincoln Park Pediatrics', '[Sample] Lincoln Park Pediatrics',
   '208000000X', 'Pediatrics', 'organization', 'Chicago', 'IL', 'hello@example.com', 'connected', now() - interval '35 days', null, 0.3, 79,
   '[Sample] Happy to share referrals for parents.', true);

-- Dana's Referrals setup. Seeded only when missing: db:reset never overwrites her choice.
insert into practice_os.referral_settings (id, home_zip, specialties)
values (true, '60614', array['family_medicine', 'internal_medicine'])
on conflict (id) do nothing;

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

-- [Sample] credentialing profile (migration 007): CAQH ProView order, no license number.
-- The NPI passes the check digit but NPPES has no one with it; the TIN starts with 00.
insert into practice_os.credentialing_profile
  (identity, education, license, npi, npi_type, taxonomy, tin, malpractice, practice_location,
   work_history, gap_explanations, documents, is_sample)
values (
  '{"name": "Dana Reyes", "credential": "LCPC", "practice_name": "Reyes Counseling PLLC", "email": "dana@example.com", "phone": "312-555-0142"}'::jsonb,
  '[{"degree": "MA, Clinical Mental Health Counseling", "school": "Example University [Sample]", "graduated": 2019}]'::jsonb,
  '{"type": "Licensed Clinical Professional Counselor (LCPC)", "state": "IL", "board": "Illinois Department of Financial and Professional Regulation (IDFPR)"}'::jsonb,
  '1999999901', 1, '101YP2500X', '00-1234567',
  '{"carrier": "Example Mutual [Sample]", "per_claim": 1000000, "aggregate": 3000000, "expires_on": "2026-12-01"}'::jsonb,
  '{"name": "Reyes Counseling PLLC", "street": "2400 N Example Ave, Suite 2", "city": "Chicago", "state": "IL", "zip": "60614", "phone": "312-555-0142", "telehealth": true}'::jsonb,
  '[{"employer": "Example Community Counseling Center [Sample]", "role": "Staff counselor", "from": "2019-08-01", "to": "2025-11-30"},
    {"employer": "Reyes Counseling PLLC", "role": "Owner, LCPC", "from": "2025-12-10", "to": null}]'::jsonb,
  '[]'::jsonb,
  '[{"id": "license", "label": "License verification", "upload": "a current IDFPR license lookup", "on_file": true, "expires_on": null},
    {"id": "malpractice", "label": "Malpractice face sheet", "upload": "your renewed malpractice face sheet", "on_file": true, "expires_on": "2026-12-01"},
    {"id": "diploma", "label": "Diploma or transcript", "upload": "your diploma or final transcript", "on_file": true, "expires_on": null},
    {"id": "cv", "label": "CV with month/year dates", "upload": "a CV with month and year for every job", "on_file": true, "expires_on": null},
    {"id": "w9", "label": "W-9 for the PLLC", "upload": "a signed W-9 for the PLLC", "on_file": false, "expires_on": null}]'::jsonb,
  true
);

-- [Sample] insurance applications (migration 009): Medicare being prepared,
-- BCBSIL waiting (follow up 30 days after applying), Aetna approved (recredential in 36 months).
insert into practice_os.payer_applications
  (payer, form, status, applied_on, follow_up_on, approved_on, effective_on, recredential_on, reference, notes, is_sample) values
  ('Medicare', 'cms855i', 'preparing', null, null, null, null, null, null, '[Sample] Prepare the CMS-855I or apply in PECOS.', true),
  ('BCBSIL', null, 'applied', '2026-10-05', '2026-11-04', null, null, null, '[Sample] APP-1042', null, true),
  ('Aetna', null, 'approved', '2026-01-12', null, '2026-03-16', '2026-04-01', '2029-03-16', null, null, true);

-- Two [Sample] Good Faith Estimates, with no client identity (migration 006): one
-- already issued, one waiting for her approval. Dates are fixed, like the CMS example.
insert into practice_os.approvals (id, kind, title, preview, payload, status, created_by, decided_at, decided_by, result, is_sample) values
  ('00000000-0000-4000-8000-000000000906', 'gfe_issue', '[Sample] GFE-2026-0001: individual therapy, $8,950.00',
   '{"body": "[Sample] 1 x 90791 $200.00 · 50 x 90837 $175.00. First visit 2026-11-12. Give it to the client by 2026-10-29.", "reference": "GFE-2026-0001"}'::jsonb,
   '{"estimate_id": "00000000-0000-4000-8000-000000000a01"}'::jsonb,
   'done', 'aeon:admin', '2026-10-28 15:00:00+00', 'clinician', '{"reference": "GFE-2026-0001", "issued_on": "2026-10-28", "on_time": true}'::jsonb, true),
  ('00000000-0000-4000-8000-000000000907', 'gfe_issue', '[Sample] GFE-2026-0002: couples therapy, $3,950.00',
   '{"body": "[Sample] 1 x 90791 $200.00 · 25 x 90834 $150.00, every 2 weeks. Client asked 2026-10-26. Give it to the client by 2026-10-29. Approving confirms these fees and marks it issued today. Aeon doesn''t send it; you give the PDF to the client.", "reference": "GFE-2026-0002"}'::jsonb,
   '{"estimate_id": "00000000-0000-4000-8000-000000000a02"}'::jsonb,
   'pending', 'aeon:admin', null, null, null, true);

insert into practice_os.good_faith_estimates
  (id, reference, basis, scheduled_on, service_on, requested_on, due_on, rule, service_kind, lines, recurring,
   total_cents, issued_on, approval_id, is_sample) values
  ('00000000-0000-4000-8000-000000000a01', 'GFE-2026-0001', 'scheduled', '2026-10-26', '2026-11-12', null, '2026-10-29',
   '45 CFR 149.610(b)(1)(vi)(B)', 'individual',
   '[{"code": "90791", "label": "First session (intake)", "quantity": 1, "cents": 20000, "location": "office"},
     {"code": "90837", "label": "Therapy, 53 minutes or longer", "quantity": 50, "cents": 17500, "location": "either"}]'::jsonb,
   '{"frequency": "weekly", "visits": 51, "from": "2026-11-12", "through": "2027-10-26"}'::jsonb,
   895000, '2026-10-28', '00000000-0000-4000-8000-000000000906', true),
  ('00000000-0000-4000-8000-000000000a02', 'GFE-2026-0002', 'requested', null, null, '2026-10-26', '2026-10-29',
   '45 CFR 149.610(b)(1)(vi)(C)', 'couples',
   '[{"code": "90791", "label": "First session (intake)", "quantity": 1, "cents": 20000, "location": "office"},
     {"code": "90834", "label": "Therapy, 38-52 minutes", "quantity": 25, "cents": 15000, "location": "either"}]'::jsonb,
   '{"frequency": "every_2_weeks", "visits": 26, "from": "2026-10-26", "through": "2027-10-26"}'::jsonb,
   395000, null, '00000000-0000-4000-8000-000000000907', true);

-- Real estimates continue after the sample numbers.
select setval('practice_os.gfe_number_seq', greatest((select last_value from practice_os.gfe_number_seq), 2));

-- [Sample] superbill (migration 011): four 53-minute video sessions from the client's
-- home in October at $175, paid in full. No client details: the PDF leaves them blank.
insert into practice_os.superbills (id, reference, lines, total_cents, paid_cents, created_by, is_sample) values
  ('00000000-0000-4000-8000-000000000b01', 'SB-2026-0001',
   '[{"date_of_service": "2026-10-05", "cpt": "90837", "modifier": "95", "units": 1, "cents": 17500, "pos": "10", "dx_pointers": ["A"]},
     {"date_of_service": "2026-10-12", "cpt": "90837", "modifier": "95", "units": 1, "cents": 17500, "pos": "10", "dx_pointers": ["A"]},
     {"date_of_service": "2026-10-19", "cpt": "90837", "modifier": "95", "units": 1, "cents": 17500, "pos": "10", "dx_pointers": ["A"]},
     {"date_of_service": "2026-10-26", "cpt": "90837", "modifier": "95", "units": 1, "cents": 17500, "pos": "10", "dx_pointers": ["A"]}]'::jsonb,
   70000, 70000, 'aeon:admin', true);
select setval('practice_os.superbill_number_seq', greatest((select last_value from practice_os.superbill_number_seq), 1));

insert into practice_os.audit_log (actor, action, details)
values ('system', 'demo_data_seeded', '{"practice": "Reyes Counseling PLLC (fictional demo practice)"}'::jsonb);
