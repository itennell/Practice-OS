-- 023: Where each fact on a Referrals card came from (referrals v2, PR 1).
--
-- A card used to hold one copy of each field, from the NPI Registry. Now every
-- source Aeon checks (NPI Registry, the CMS Medicare files, the state license
-- list, OpenStreetMap, the practice's own website, or what she typed) leaves
-- one row per field here: the value, where it came from, how it was matched to
-- the card and when. lib/referrals/evidence merges them in plain code into the
-- card's "Confirmed by" line, its confidence and any conflicts.
--
-- Google Places is not a stored origin: its terms allow caching only the place
-- id, so Places answers are used when shown and never saved.

create table practice_os.referral_facts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references practice_os.referral_sources (id) on delete cascade,
  field text not null check (field in (
    'name', 'credential', 'organization', 'address', 'phone', 'fax', 'email', 'website',
    'npi_status', 'license_status', 'medicare', 'opt_out'
  )),
  value text not null check (length(value) between 1 and 500),
  origin text not null check (origin in (
    'nppes', 'cms_dac', 'cms_order_referring', 'cms_opt_out', 'state_license', 'osm', 'website', 'clinician'
  )),
  origin_url text check (origin_url is null or origin_url ~ '^https://'),
  match_method text not null check (match_method in ('npi', 'name_address', 'name_city', 'manual')),
  match_score numeric(4, 3) check (match_score between 0 and 1),
  -- How it was found: the page an email was on, the robots.txt decision, the label shown.
  detail jsonb not null default '{}',
  checked_at timestamptz not null default now(),
  unique (source_id, field, origin)
);
create index referral_facts_source_idx on practice_os.referral_facts (source_id);
alter table practice_os.referral_facts enable row level security;

-- The merged result, kept on the card so the board can sort and filter without
-- re-merging: when it was last checked, how sure Aeon is, and what disagrees.
alter table practice_os.referral_sources
  add column checked_at timestamptz,
  add column confidence text check (confidence in ('confirmed', 'partly', 'unconfirmed')),
  add column conflicts jsonb not null default '[]',
  add column website text check (website is null or website ~ '^https?://');

-- Answers from outside services and practice websites, so a re-check is polite:
-- ETag and Last-Modified for conditional requests, robots.txt kept a day.
create table practice_os.referral_fetch_cache (
  url text primary key check (url ~ '^https?://' and length(url) <= 2000),
  status smallint not null,
  etag text,
  last_modified text,
  body text check (length(body) <= 600000),
  fetched_at timestamptz not null default now()
);
alter table practice_os.referral_fetch_cache enable row level security;
