-- 032: the steps she has checked off on her insurance checklists.
--
-- scope is a catalog payer id (e.g. 'aetna') or 'prerequisites' for the shared
-- list (NPI, CAQH, malpractice, EIN). step_id is the step's id in the catalog.
-- A row means done; unchecking deletes it. Checking steps moves the payer's
-- status (first step: preparing; the step where she submits: applied).

create table practice_os.payer_steps (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope ~ '^[a-z0-9-]{2,60}$'),
  step_id text not null check (step_id ~ '^[a-z0-9-]{2,80}$'),
  done_on date not null,
  done_by text not null check (done_by in ('clinician', 'aeon')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  unique (scope, step_id)
);

alter table practice_os.payer_steps enable row level security;
