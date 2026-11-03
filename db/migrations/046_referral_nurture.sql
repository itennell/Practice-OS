-- 046: Keeping referral relationships warm (referral nurture).
--
-- 1. "I referred someone to them" (referred_out) on the contact log: a date and
--    how many people, nothing else. No name, initials, age, reason or note: the
--    database refuses a note on that row. This is the same SQL as part 2 of
--    migration 045 (referral discovery) and is safe to run before or after it,
--    or twice.
-- 2. People she refers to: her own notes about THEM for referring out, their
--    availability, their fees and the insurance they take. Professional facts
--    about the provider only, never anything about a client; the app checks each
--    note with the privacy guard before saving it. A card is on her "People I
--    refer to" list when she has referred someone to them or saved one of these.
-- Safe to run twice.

-- 1. referred_out: a date and a count only.
alter table practice_os.referral_contacts add column if not exists people_count smallint;
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_kind_check;
alter table practice_os.referral_contacts
  add constraint referral_contacts_kind_check
  check (kind in ('called', 'emailed', 'met', 'sent_letter', 'replied', 'note', 'referred', 'referred_out'));
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_referred_out_date_and_count;
alter table practice_os.referral_contacts
  add constraint referral_contacts_referred_out_date_and_count
  check (kind <> 'referred_out' or (note is null and people_count between 1 and 20));
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_count_only_referred_out;
alter table practice_os.referral_contacts
  add constraint referral_contacts_count_only_referred_out
  check (people_count is null or kind = 'referred_out');

-- 2. Her notes about the people she refers to.
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
