-- Migration 013: onboarding (Session A, approved by Isaiah 2026-10-28).
--
-- Her own cell for urgent alerts: the crisis check and Front Desk handoffs text it.
-- Onboarding asks for it, so it lives in the app instead of CLINICIAN_ALERT_PHONE in
-- .env, which she never edits. US numbers only, stored as +1XXXXXXXXXX. Null until she
-- answers; Front Desk reads it and falls back to CLINICIAN_ALERT_PHONE while it is null.

alter table practice_os.settings
  add column alert_phone text
  check (alert_phone ~ '^\+1[2-9][0-9]{9}$');
