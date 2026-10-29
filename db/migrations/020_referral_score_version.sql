-- Which scoring wrote referral_sources.fit_score. Cards from before the
-- research tier weights (2026-10-29) are 1; the app scores them again and
-- writes the current version (lib/referrals/tier.ts SCORE_VERSION).
alter table practice_os.referral_sources
  add column if not exists score_version smallint not null default 1;
