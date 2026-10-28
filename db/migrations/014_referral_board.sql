-- 014: what each card on the Referrals board shows.
--
-- taxonomy (from 001) now holds the NUCC taxonomy code from the NPI Registry
-- (for example 207Q00000X); specialty holds its plain label ("Family medicine").
-- taxonomy gets no CHECK: the four sample rows hold labels, so lib/referrals
-- validates the code instead. The 7-day follow-up uses next_follow_up_on (001).

alter table practice_os.referral_sources
  add column specialty text,
  add column npi_type text check (npi_type in ('individual', 'organization')),
  add column credential text,
  add column distance_miles numeric(5,1) check (distance_miles >= 0),
  add column fit_score smallint check (fit_score between 0 and 100);

create index referral_sources_stage_idx on practice_os.referral_sources (stage, fit_score desc);

-- Her Referrals setup (asked in onboarding): the ZIP to search around and the
-- kinds of referral sources she wants. One row, like settings.
create table practice_os.referral_settings (
  id boolean primary key default true check (id),
  home_zip text check (home_zip ~ '^[0-9]{5}$'),
  specialties text[] not null default '{}'
    check (specialties <@ array['family_medicine', 'internal_medicine', 'ob_gyn', 'pediatrics', 'oncology', 'therapists']),
  updated_at timestamptz not null default now()
);
alter table practice_os.referral_settings enable row level security;
