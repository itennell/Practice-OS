-- 006: Good Faith Estimates she can save and approve, plus her office hours and fees.
--
-- 1. clinician_profile.office_hours: the days her practice is open. GFE due dates
--    count only these days (45 CFR 149.610 doesn't define "business day").
--    clinician_profile.fee_schedule: her self-pay rates, used to fill estimates.
-- 2. good_faith_estimates: one row per estimate, with NO client identity. There is
--    no column for a client's name, birthday, address, phone, email or diagnosis.
--    She types those only when she makes the PDF; they are never stored. Until a
--    BAA is in place this table holds no health information about a person.
-- 3. approvals accept the new kind gfe_issue: approving confirms the fees and
--    marks the estimate issued. She gives the PDF to the client herself.

-- 1. Office hours and fees ----------------------------------------------------------

alter table practice_os.clinician_profile
  add column office_hours jsonb not null
    default '{"weekdays": [1, 2, 3, 4, 5], "closed_on": [], "close_federal_holidays": true}'::jsonb,
  add column fee_schedule jsonb not null default '[]'::jsonb;

alter table practice_os.clinician_profile add constraint clinician_profile_office_hours_shape check (
  jsonb_typeof(office_hours -> 'weekdays') = 'array'
  and jsonb_array_length(office_hours -> 'weekdays') between 1 and 7
  and jsonb_typeof(office_hours -> 'closed_on') = 'array'
  and jsonb_typeof(office_hours -> 'close_federal_holidays') = 'boolean'
);
-- Each fee: {"code": "90837", "label": "...", "cents": 17500}.
alter table practice_os.clinician_profile add constraint clinician_profile_fee_schedule_shape check (
  jsonb_typeof(fee_schedule) = 'array'
);

-- 2. Estimates, without client identity ------------------------------------------------

create sequence practice_os.gfe_number_seq;

create table practice_os.good_faith_estimates (
  id uuid primary key default gen_random_uuid(),
  -- What she matches against her own client records, e.g. GFE-2026-0001.
  reference text not null unique
    default ('GFE-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('practice_os.gfe_number_seq')::text, 4, '0')),
  -- scheduled: booked a visit; requested: the client asked for an estimate.
  basis text not null check (basis in ('scheduled', 'requested')),
  scheduled_on date,
  service_on date,
  requested_on date,
  check (
    (basis = 'scheduled' and scheduled_on is not null and service_on is not null
       and service_on >= scheduled_on and requested_on is null)
    or (basis = 'requested' and requested_on is not null and scheduled_on is null)
  ),
  -- Null when booked fewer than 3 open days out (no deadline at booking).
  due_on date,
  rule text not null,                       -- e.g. 45 CFR 149.610(b)(1)(vi)(B)
  -- A fixed list, so there's no free text that could hold clinical details.
  service_kind text not null check (service_kind in ('individual', 'couples', 'family', 'group')),
  -- [{"code": "90837", "label": "...", "quantity": 50, "cents": 17500, "location": "office"}]
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) between 1 and 20),
  -- {"frequency": "weekly", "visits": 51, "from": "2026-11-12", "through": "2027-10-26"}; at most 12 months.
  recurring jsonb,
  total_cents integer not null check (total_cents >= 0),
  -- Set by the gfe_issue executor when she approves.
  issued_on date,
  on_time boolean generated always as (
    case when issued_on is null then null when due_on is null then true else issued_on <= due_on end
  ) stored,
  approval_id uuid unique references practice_os.approvals (id) on delete set null,
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index good_faith_estimates_due_idx on practice_os.good_faith_estimates (due_on) where issued_on is null;

create trigger good_faith_estimates_touch_updated_at before update on practice_os.good_faith_estimates
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.good_faith_estimates enable row level security;

-- 3. The approval kind ------------------------------------------------------------------

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules', 'gfe_issue'
));
