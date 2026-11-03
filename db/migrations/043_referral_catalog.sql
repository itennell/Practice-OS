-- 043: the referral source catalog (docs/research/referral-sources.json).
--
-- referral_settings.specialties was limited (014) to six ids, so newer kinds
-- (psychiatry, and the 25 kinds the catalog adds) could not be saved. Ids are
-- now validated in code against the catalog (lib/referrals/catalog.ts, checked
-- where settings are saved in lib/referrals/settings.ts saveReferralSettings);
-- the database only checks their shape: lowercase letters and underscores, no nulls.
-- niche_preset is the niche she picks (oncology_serious_illness, grief_loss, ...),
-- null until she picks one; its id is checked against the catalog the same way.
-- Safe to run twice.

create or replace function practice_os.ids_look_valid(ids text[]) returns boolean
language sql immutable set search_path = '' as $$
  select not exists (select 1 from unnest(ids) as x where x is null or x !~ '^[a-z_]+$')
$$;

alter table practice_os.referral_settings drop constraint if exists referral_settings_specialties_check;
alter table practice_os.referral_settings
  add constraint referral_settings_specialties_check check (practice_os.ids_look_valid(specialties));

alter table practice_os.referral_settings add column if not exists niche_preset text;
alter table practice_os.referral_settings drop constraint if exists referral_settings_niche_preset_check;
alter table practice_os.referral_settings
  add constraint referral_settings_niche_preset_check check (niche_preset ~ '^[a-z_]+$');
