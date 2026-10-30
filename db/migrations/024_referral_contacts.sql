-- 024: The contact log on each Referrals card (referrals v2, PR 4).
--
-- What she did with each referral source and when: called, emailed, met, sent
-- the letter, they replied, a note, or "they referred someone". The log moves
-- the card's tier (docs/research/referral-tiers.json relationship modifiers)
-- and its next follow-up date feeds the morning brief.
--
-- "They referred someone" is a date and nothing else. Under 740 ILCS 110 even
-- confirming that someone is a client is protected, so that row may carry no
-- note at all: no name, initials, age or reason. Other notes go through the
-- plain-code privacy guard before they are saved.

create table practice_os.referral_contacts (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references practice_os.referral_sources (id) on delete cascade,
  kind text not null check (kind in ('called', 'emailed', 'met', 'sent_letter', 'replied', 'note', 'referred')),
  happened_on date not null,
  note text check (length(note) between 1 and 500),
  created_by text not null check (created_by in ('clinician', 'aeon')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  constraint referral_contacts_referred_has_no_note check (kind <> 'referred' or note is null)
);
create index referral_contacts_source_idx on practice_os.referral_contacts (source_id, happened_on desc);
alter table practice_os.referral_contacts enable row level security;

-- Who introduced her (a warm intro). A colleague's name or "my old supervisor"; never a client.
alter table practice_os.referral_sources
  add column introduced_by text check (length(introduced_by) between 1 and 120);
