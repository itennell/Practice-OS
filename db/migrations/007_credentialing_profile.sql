-- 007: her credentialing profile, saved and editable.
--
-- One row, laid out in CAQH ProView's order, so the Credentialing tab, the CAQH
-- prep checklist, payer forms and Good Faith Estimates all read the same facts.
-- It never holds a license number: she types that into CAQH and payer portals
-- herself. A check refuses any license field named like a number.
-- It holds her own business details (NPI, TIN, office address), never anything
-- about a client.

create table practice_os.credentialing_profile (
  id boolean primary key default true check (id),

  -- {"name", "credential", "practice_name", "email", "phone"}
  identity jsonb not null default '{}'::jsonb check (jsonb_typeof(identity) = 'object'),

  -- [{"degree", "school", "graduated"}]
  education jsonb not null default '[]'::jsonb check (jsonb_typeof(education) = 'array'),

  -- {"type", "state", "board"}; never a number.
  license jsonb not null default '{}'::jsonb check (
    jsonb_typeof(license) = 'object'
    and not (license ?| array['number', 'license_number', 'license_no', 'licenseNumber'])
  ),

  npi text check (npi ~ '^[12][0-9]{9}$'),
  npi_type smallint check (npi_type in (1, 2)),
  taxonomy text check (taxonomy ~ '^[0-9A-Z]{10}$'),
  -- The practice's federal tax ID (EIN) as 12-3456789.
  tin text check (tin ~ '^[0-9]{2}-[0-9]{7}$'),
  -- Last check of her own NPI against the public NPPES registry.
  npi_checked_at timestamptz,
  npi_check jsonb,                       -- {"found": true, "name": "...", "taxonomy": "...", "matches": true}

  -- {"carrier", "per_claim", "aggregate", "expires_on"}
  malpractice jsonb not null default '{}'::jsonb check (jsonb_typeof(malpractice) = 'object'),

  -- {"name", "street", "city", "state", "zip", "phone", "telehealth"}
  practice_location jsonb not null default '{}'::jsonb check (jsonb_typeof(practice_location) = 'object'),

  -- [{"employer", "role", "from", "to"}] and [{"from", "to", "reason"}]
  work_history jsonb not null default '[]'::jsonb check (jsonb_typeof(work_history) = 'array'),
  gap_explanations jsonb not null default '[]'::jsonb check (jsonb_typeof(gap_explanations) = 'array'),

  -- [{"id", "label", "upload", "on_file", "expires_on"}]
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),

  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger credentialing_profile_touch_updated_at before update on practice_os.credentialing_profile
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.credentialing_profile enable row level security;
