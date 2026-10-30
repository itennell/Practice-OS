-- 034: Her own wording for the client forms library (Admin › Client forms).
--
-- One row per form type holds the practice-level changes she makes to a template:
-- replacement text for the clauses the library lets her edit, and one added
-- paragraph. The '_practice' row holds the policies every form uses (cancellation
-- window, fees, reply time, privacy contact). Nothing here is ever a client's
-- answer: templates only, and plain code refuses client names and details before
-- a row is written (lib/client-forms/store.ts). Not demo data, so db:reset keeps it.

create table practice_os.client_form_templates (
  form_type text primary key check (form_type ~ '^(_practice|[a-z0-9_]{2,40})$'),
  overrides jsonb not null default '{}'::jsonb check (jsonb_typeof(overrides) = 'object' and length(overrides::text) <= 20000),
  updated_at timestamptz not null default now()
);

alter table practice_os.client_form_templates enable row level security;
