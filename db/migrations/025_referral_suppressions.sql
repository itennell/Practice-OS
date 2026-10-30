-- 025: Do not contact (referrals v2, PR 4).
--
-- A provider who asked not to be contacted, or whom she marked not interested,
-- is never suggested again: searches, the map and "who should I reach out to"
-- skip that NPI even if the card is deleted and the provider is found again.
-- Only the NPI is kept. Not demo data: `npm run db:reset` never clears it.

create table practice_os.referral_suppressions (
  npi text primary key check (npi ~ '^[0-9]{10}$'),
  reason text not null check (reason in ('asked_not_to', 'not_interested')),
  created_at timestamptz not null default now()
);
alter table practice_os.referral_suppressions enable row level security;
