-- 009: her insurance (payer) applications, one row per payer.
--
-- Aeon fills a payer's enrollment form from her credentialing profile (first:
-- Medicare's CMS-855I) and tracks each application: when she applied, when to
-- follow up, when it was approved and when to recredential (36 months, NCQA).
-- Aeon never signs or submits; she does. Follow-up and recredential dates show
-- on Deadlines and in the morning brief, read from this table.
-- (008 is reserved for Aeon's memory and chat, built in another branch.)

create table practice_os.payer_applications (
  id uuid primary key default gen_random_uuid(),
  payer text not null check (length(payer) between 2 and 120),     -- e.g. "Medicare (Novitas)", "BCBSIL"
  -- The form Aeon can fill for this payer, if any.
  form text check (form in ('cms855i')),
  status text not null default 'preparing'
    check (status in ('preparing', 'applied', 'pending', 'approved', 'denied', 'withdrawn')),
  applied_on date,
  follow_up_on date,
  approved_on date,
  effective_on date,
  recredential_on date,
  -- The payer's own tracking or provider number (not a license number).
  reference text check (length(reference) <= 60),
  notes text check (length(notes) <= 500),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'preparing' or applied_on is not null),
  check (status <> 'approved' or approved_on is not null),
  check (follow_up_on is null or applied_on is null or follow_up_on >= applied_on)
);
create index payer_applications_follow_up_idx on practice_os.payer_applications (follow_up_on)
  where status in ('applied', 'pending');

create trigger payer_applications_touch_updated_at before update on practice_os.payer_applications
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.payer_applications enable row level security;
