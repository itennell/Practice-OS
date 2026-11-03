-- 046: Keeping referral relationships warm (referral nurture).
--
-- People she refers to: her own notes about THEM for referring out, their
-- availability, their fees and the insurance they take. Professional facts
-- about the provider only, never anything about a client; the app checks each
-- note with the privacy guard before saving it. A card is on her "People I
-- refer to" list when she has referred someone to them (referred_out, a date
-- and a required count only, from migration 045) or saved one of these.
-- Safe to run twice.

alter table practice_os.referral_sources add column if not exists refer_out_availability text;
alter table practice_os.referral_sources add column if not exists refer_out_fees text;
alter table practice_os.referral_sources add column if not exists refer_out_insurance text;
alter table practice_os.referral_sources add column if not exists refer_out_updated_at timestamptz;

alter table practice_os.referral_sources drop constraint if exists referral_sources_refer_out_availability_check;
alter table practice_os.referral_sources
  add constraint referral_sources_refer_out_availability_check check (length(refer_out_availability) between 1 and 120);
alter table practice_os.referral_sources drop constraint if exists referral_sources_refer_out_fees_check;
alter table practice_os.referral_sources
  add constraint referral_sources_refer_out_fees_check check (length(refer_out_fees) between 1 and 120);
alter table practice_os.referral_sources drop constraint if exists referral_sources_refer_out_insurance_check;
alter table practice_os.referral_sources
  add constraint referral_sources_refer_out_insurance_check check (length(refer_out_insurance) between 1 and 200);
