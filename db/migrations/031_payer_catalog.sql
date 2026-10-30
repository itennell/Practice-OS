-- 031: tie her insurance applications to the payer catalog (data/payers/*.json).
--
-- The Insurance tab lists every payer that fits her license and state up front,
-- each as "not started" until she begins. catalog_id names the catalog entry
-- (null for a payer she typed in herself); network is the plan or network she is
-- joining (e.g. BCBSIL PPO); stage is where she is: credentialing, then
-- contracting (contract, fee schedule, effective date). Two new statuses:
-- not_started and follow_up. Aeon never submits; she does.

alter table practice_os.payer_applications
  add column catalog_id text check (catalog_id ~ '^[a-z0-9-]{2,60}$'),
  add column network text check (length(network) between 2 and 120),
  add column stage text not null default 'credentialing' check (stage in ('credentialing', 'contracting'));

-- Replace the status list and the "applied needs a date" check to allow the new statuses.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'practice_os.payer_applications'::regclass and contype = 'c'
      and (pg_get_constraintdef(oid) like '%status = ANY%' or pg_get_constraintdef(oid) like '%applied_on IS NOT NULL%')
  loop
    execute format('alter table practice_os.payer_applications drop constraint %I', c.conname);
  end loop;
end $$;

alter table practice_os.payer_applications
  add constraint payer_applications_status_check
    check (status in ('not_started', 'preparing', 'applied', 'pending', 'follow_up', 'approved', 'denied', 'withdrawn')),
  add constraint payer_applications_applied_check
    check (status in ('not_started', 'preparing') or applied_on is not null);

-- One application per catalog payer.
create unique index payer_applications_catalog_idx on practice_os.payer_applications (catalog_id)
  where catalog_id is not null;

drop index if exists practice_os.payer_applications_follow_up_idx;
create index payer_applications_follow_up_idx on practice_os.payer_applications (follow_up_on)
  where status in ('applied', 'pending', 'follow_up');
