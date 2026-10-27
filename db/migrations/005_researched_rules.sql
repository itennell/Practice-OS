-- 005: rules Muse researches for the clinician's state (lib/compliance/research.ts).
--
-- 1. compliance_facts.license_expires_on: her own license expiration, for states
--    where licenses renew on the licensee's date (California: two years from issue).
-- 2. compliance_rules: the researched rules she approved, with the evidence behind
--    each one. Shipped rules (federal, Illinois) stay in code and never live here.
-- 3. approvals accept the new kind state_rules (one approval per research run).
-- 4. obligations.evidence: shows "cited" or "page-confirmed" on her Deadlines cards.

-- 1. Her license date ---------------------------------------------------------------

alter table practice_os.compliance_facts add column license_expires_on date;

-- 2. Researched rules ----------------------------------------------------------------

create table practice_os.compliance_rules (
  id text primary key check (id ~ '^[a-z0-9_]+$'),
  -- A state (CA) or state-city (CA-SF); never 'US': federal rules ship in code.
  jurisdiction text not null check (jurisdiction ~ '^[A-Z]{2}(-[A-Z]{2,4})?$' and jurisdiction <> 'US'),
  rule jsonb not null check (rule ->> 'id' = id and rule ->> 'jurisdiction' = jurisdiction),
  -- agent: Muse researched it and she approved the batch; clinician: she confirmed this rule with her board.
  verified_by text not null default 'agent' check (verified_by in ('agent', 'clinician')),
  evidence_level text not null check (evidence_level in ('cited', 'page')),
  -- What backed it: the cited URL, Muse's cited passage, our page-check result.
  evidence jsonb not null default '{}'::jsonb,
  -- needs_recheck: the quarterly re-check couldn't find the quote any more; retired: replaced or withdrawn.
  status text not null default 'active' check (status in ('active', 'needs_recheck', 'retired')),
  researched_at timestamptz not null default now(),
  checked_at timestamptz not null default now(),   -- last time Muse re-checked its source
  confirmed_at timestamptz,
  approval_id uuid references practice_os.approvals (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((verified_by = 'clinician') = (confirmed_at is not null))
);
create index compliance_rules_active_idx on practice_os.compliance_rules (jurisdiction) where status = 'active';
create index compliance_rules_recheck_idx on practice_os.compliance_rules (checked_at) where status <> 'retired';

create trigger compliance_rules_touch_updated_at before update on practice_os.compliance_rules
  for each row execute function practice_os.touch_updated_at();
alter table practice_os.compliance_rules enable row level security;

-- 3. The approval kind ----------------------------------------------------------------

alter table practice_os.approvals drop constraint approvals_kind_check;
alter table practice_os.approvals add constraint approvals_kind_check check (kind in (
  'referral_letter', 'instagram_post', 'sms_reply', 'consult_booking',
  'consult_reschedule', 'consult_cancel', 'web_chat_reply',
  'test_note', 'state_rules'
));

-- 4. Evidence on her calendar ---------------------------------------------------------

alter table practice_os.obligations
  add column evidence text check (evidence in ('cited', 'page'));
-- Only researched rules carry an evidence level; shipped (maintainer) rules don't.
alter table practice_os.obligations add constraint obligations_evidence_only_for_agent check (
  evidence is null or verified_by in ('agent', 'clinician')
);
