-- 004: compliance calendar built from rules (lib/compliance/rules).
--
-- 1. Practices can be in any US state, not just Illinois.
-- 2. compliance_facts: one row of practice facts that switch rules on or off
--    (how the PLLC is taxed, employees, last CAQH attestation...). No license
--    number is ever stored.
-- 3. obligations becomes the calendar the rules produce: each row names its
--    rule, its source and how it was verified, and can be a dated deadline, an
--    event clock, a setup reminder ("Did you set this up?") or a note.

-- 1. Any state ------------------------------------------------------------------

alter table practice_os.clinician_profile drop constraint clinician_profile_state_check;
alter table practice_os.clinician_profile add constraint clinician_profile_state_check
  check (state ~ '^[A-Z]{2}$');

-- 2. Practice facts (one row) ----------------------------------------------------

create table practice_os.compliance_facts (
  id boolean primary key default true check (id),
  city_code text check (city_code ~ '^[A-Z]{2,4}$'),          -- local rules, e.g. CHI
  first_renewal boolean not null default false,               -- no CE due on a first renewal
  sees_adults_26_plus boolean not null default true,          -- Illinois dementia CE
  has_pllc boolean not null default false,
  pllc_formed_on date,
  entity_tax text check (entity_tax in ('single_owner', 'partnership', 's_corp')),
  employee_count int not null default 0 check (employee_count >= 0),
  has_contractors boolean not null default false,
  bills_insurance_electronically boolean not null default false, -- HIPAA covered entity
  in_network_bcbsil boolean not null default false,
  medicare text not null default 'none' check (medicare in ('enrolled', 'opted_out', 'none')),
  medicare_revalidation_due_on date,
  medicare_opt_out_ends_on date,
  medicaid_enrolled boolean not null default false,
  impact_revalidation_due_on date,
  caqh_last_attested_on date,
  has_psypact_apit boolean not null default false,
  apit_granted_on date,
  qualified_examiner boolean not null default false,          -- 405 ILCS 5/1-122 (FOID reporting)
  uses_texting boolean not null default false,
  ce_hours_done numeric(5, 1) not null default 0 check (ce_hours_done >= 0),
  ce_topics_done text[] not null default '{}',
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger compliance_facts_touch_updated_at before update on practice_os.compliance_facts
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.compliance_facts enable row level security;

-- 3. Obligations from rules ------------------------------------------------------

-- Clocks, setup reminders and notes have no fixed due date.
alter table practice_os.obligations alter column due_on drop not null;

alter table practice_os.obligations
  add column rule_id text,
  add column kind text not null default 'deadline' check (kind in ('deadline', 'clock', 'setup', 'note')),
  add column jurisdiction text not null default 'US' check (jurisdiction ~ '^(US|[A-Z]{2}(-[A-Z]{2,4})?)$'),
  add column verified_by text not null default 'maintainer' check (verified_by in ('maintainer', 'agent', 'clinician')),
  add column lead_red_days int not null default 14 check (lead_red_days >= 0),
  add column lead_yellow_days int not null default 45 check (lead_yellow_days >= 0),
  add column what_to_do text,
  add column you_must text,                 -- the part only she can do (sign, attest, pay)
  add column guide_slug text,
  add column citation text,
  add column quote text,
  add column last_verified_on date,
  add column caveat text,
  add column ce_required numeric(5, 1),
  add column ce_done numeric(5, 1),
  add column ce_topics_left jsonb,
  add column started_on date,               -- clock: when the event happened
  add column answered_on date,              -- setup: when she answered
  add column next_ask_on date;              -- setup: when Aeon asks again

alter table practice_os.obligations drop constraint obligations_category_check;
alter table practice_os.obligations add constraint obligations_category_check check (category in (
  'license_renewal', 'license_window', 'ce_hours', 'caqh_reattestation', 'medicare_revalidation',
  'medicaid_revalidation', 'pllc_annual_report', 'pllc_registration', 'quarterly_taxes',
  'business_tax_return', 'payroll', 'contractors', 'hipaa', 'billing', 'telehealth',
  'reporting_duty', 'npi_update', 'texting', 'insurance', 'business_setup', 'other'
));

-- not_yet: setup she hasn't done (asked again later); not_applicable: hidden until a fact changes.
alter table practice_os.obligations drop constraint obligations_status_check;
alter table practice_os.obligations add constraint obligations_status_check check (status in (
  'upcoming', 'done', 'snoozed', 'not_yet', 'not_applicable'
));

-- A deadline has a date; a clock gets one when its event starts it; setups and notes never do
-- (a setup comes back on next_ask_on instead).
alter table practice_os.obligations add constraint obligations_due_on_by_kind check (
  (kind = 'deadline' and due_on is not null)
  or (kind = 'clock' and (started_on is null) = (due_on is null))
  or (kind in ('setup', 'note') and due_on is null)
);

-- One row per rule and occurrence, so regenerating the calendar updates rows in place
-- and keeps her answers (status, answered_on, next_ask_on).
create unique index obligations_rule_occurrence_idx on practice_os.obligations (rule_id, due_on, started_on)
  nulls not distinct where rule_id is not null;
create index obligations_next_ask_idx on practice_os.obligations (next_ask_on) where kind = 'setup';
