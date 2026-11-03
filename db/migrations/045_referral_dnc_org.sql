-- 045: Organisations on the Referrals board (referrals discovery).
--
-- 1. Do not contact for any card, by an org key as well as the NPI. Hospices,
--    funeral homes, churches and people she adds by hand have no NPI, so the NPI
--    list (025) can't hold them. The key is the normalized name and the
--    normalized street and ZIP, the city, or the ZIP (lib/referrals/dnc-key.ts).
--    Searches, the weekly plan, letters and the debrief's "who else" skip them.
--    Not demo data: `npm run db:reset` never clears it.
-- 2. "You referred someone to them" (referred_out) on the contact log: a date and
--    how many people, nothing else. No name, initials, age, reason or note: the
--    database refuses a note, and a count is required. Every earlier kind is kept.
-- 3. Where a card came from: its catalog type (docs/research/referral-sources.json),
--    how it was found (NPI Registry, the CMS Provider Data Catalog, OpenStreetMap,
--    or added by her), the CMS certification number (CCN) or OpenStreetMap id
--    so a search refreshes the same card, and `sensitive` for domestic violence
--    and sexual assault agencies and shelters: those cards never hold a street
--    address, ZIP or distance, only a city, and the database refuses one.
--    site_hashes keeps one-way hashes of a sensitive site's street and ZIP so a
--    person NPPES lists at the same address is marked sensitive too.
-- 4. Backfill: cards already on the board whose catalog type is sensitive or
--    whose name reads as a DV/SA agency or shelter (the same cues as
--    lib/referrals/sensitive.ts) become sensitive now: street, ZIP and distance
--    are cleared and their address evidence is deleted. (The board has no
--    lat/lon columns; points are computed from the address or ZIP, now gone.)
-- 5. Evidence from the CMS Provider Data Catalog (origin cms_pdc). Every earlier origin is kept.
-- Safe to run twice.

-- 1. Do not contact, by org key.
create table if not exists practice_os.referral_suppressions_org (
  org_key text primary key check (length(org_key) between 3 and 400),
  name_key text not null check (length(name_key) between 2 and 200),
  street_key text check (street_key is null or length(street_key) between 3 and 200),
  city_key text check (city_key is null or length(city_key) between 2 and 100),
  zip_key text check (zip_key is null or zip_key ~ '^[0-9]{5}$'),
  reason text not null check (reason in ('asked_not_to', 'not_interested')),
  created_at timestamptz not null default now()
);
alter table practice_os.referral_suppressions_org add column if not exists zip_key text;
alter table practice_os.referral_suppressions_org enable row level security;

-- 2. referred_out: a date and a count only.
alter table practice_os.referral_contacts add column if not exists people_count smallint;
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_kind_check;
alter table practice_os.referral_contacts
  add constraint referral_contacts_kind_check
  check (kind in ('called', 'emailed', 'met', 'sent_letter', 'replied', 'note', 'referred', 'referred_out'));
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_referred_out_date_and_count;
alter table practice_os.referral_contacts
  add constraint referral_contacts_referred_out_date_and_count
  check (kind <> 'referred_out' or (note is null and people_count is not null and people_count between 1 and 20));
alter table practice_os.referral_contacts drop constraint if exists referral_contacts_count_only_referred_out;
alter table practice_os.referral_contacts
  add constraint referral_contacts_count_only_referred_out
  check (people_count is null or kind = 'referred_out');

-- 3. Where a card came from.
alter table practice_os.referral_sources add column if not exists source_type text;
alter table practice_os.referral_sources add column if not exists found_via text;
alter table practice_os.referral_sources add column if not exists ccn text;
alter table practice_os.referral_sources add column if not exists osm_ref text;
alter table practice_os.referral_sources add column if not exists sensitive boolean not null default false;
alter table practice_os.referral_sources add column if not exists site_hashes text[];

alter table practice_os.referral_sources drop constraint if exists referral_sources_source_type_check;
alter table practice_os.referral_sources
  add constraint referral_sources_source_type_check check (source_type ~ '^[a-z_]+$');
alter table practice_os.referral_sources drop constraint if exists referral_sources_found_via_check;
alter table practice_os.referral_sources
  add constraint referral_sources_found_via_check check (found_via in ('nppes', 'cms_provider_data', 'osm', 'manual'));
alter table practice_os.referral_sources drop constraint if exists referral_sources_ccn_check;
alter table practice_os.referral_sources
  add constraint referral_sources_ccn_check check (ccn ~ '^[0-9A-Z]{6}$');
alter table practice_os.referral_sources drop constraint if exists referral_sources_osm_ref_check;
alter table practice_os.referral_sources
  add constraint referral_sources_osm_ref_check check (osm_ref ~ '^(node|way|relation)/[0-9]{1,15}$');
alter table practice_os.referral_sources drop constraint if exists referral_sources_site_hashes_check;
alter table practice_os.referral_sources
  add constraint referral_sources_site_hashes_check check (site_hashes is null or (sensitive and cardinality(site_hashes) <= 4));
create unique index if not exists referral_sources_ccn_key on practice_os.referral_sources (ccn);
create unique index if not exists referral_sources_osm_ref_key on practice_os.referral_sources (osm_ref);

update practice_os.referral_sources set found_via = 'nppes' where npi is not null and found_via is null;

-- 4. Backfill sensitive cards. The cue list matches lib/referrals/sensitive.ts (SENSITIVE_CUES,
--    BORDERLINE + SERVICES_WORD) on the same text: lower case, apostrophes deleted, the rest spaces.
create or replace function practice_os.name_looks_sensitive(raw text) returns boolean
language sql immutable set search_path = '' as $$
  with t as (
    select trim(regexp_replace(regexp_replace(lower(coalesce(raw, '')), '[''’‘`]', '', 'g'), '[^a-z0-9]+', ' ', 'g')) as s
  ), b as (
    select s, substring(s from '\m(house of [a-z]+|havens?|refuges?|sanctuar(?:y|ies))\M') as border from t
  )
  select s ~ '\m(domestic (violence|abuse)|family violence|intimate partner violence|sexual (assault|abuse|violence)|rape crisis|battered|womens (center|centre|centers|shelter|shelters|refuge|safe ?house|resource center)|shelters?|safe ?houses?|safe harbou?rs?|house of hope|ruths house|anti ?violence|survivors? of|violence (prevention|intervention))\M'
      or (border is not null
          and replace(s, border, ' ') ~ '\m(services?|centers?|centres?|projects?|network|programs?|ministr(y|ies)|alliance|outreach|homes?|house|inc|foundation|coalition|place|support)\M')
    from b
$$;

with hit as (
  select id from practice_os.referral_sources
   where not sensitive
     and (source_type in ('dv_sa_agencies', 'shelters')
          or practice_os.name_looks_sensitive(name)
          or practice_os.name_looks_sensitive(organization))
)
update practice_os.referral_sources s
   set sensitive = true,
       -- The same plain hash lib/referrals/sensitive.ts siteHashes makes, so people at this site are marked too.
       site_hashes = case when s.address is not null and length(regexp_replace(coalesce(s.zip, ''), '[^0-9]', '', 'g')) >= 5
         then array[encode(sha256(convert_to(regexp_replace(lower(s.address), '[^a-z0-9]', '', 'g')
                || left(regexp_replace(s.zip, '[^0-9]', '', 'g'), 5), 'UTF8')), 'hex')] end,
       address = null, zip = null, distance_miles = null, updated_at = now()
  from hit where s.id = hit.id;

delete from practice_os.referral_facts f
 using practice_os.referral_sources s
 where f.source_id = s.id and s.sensitive and f.field = 'address';

alter table practice_os.referral_sources drop constraint if exists referral_sources_sensitive_no_street;
alter table practice_os.referral_sources
  add constraint referral_sources_sensitive_no_street
  check (not sensitive or (address is null and zip is null and distance_miles is null));

-- 5. Evidence from the CMS Provider Data Catalog.
alter table practice_os.referral_facts drop constraint if exists referral_facts_origin_check;
alter table practice_os.referral_facts
  add constraint referral_facts_origin_check check (origin in (
    'nppes', 'cms_dac', 'cms_order_referring', 'cms_opt_out', 'state_license', 'osm', 'website', 'clinician', 'cms_pdc'
  ));
