-- 027: the studio's edit history. Every change, typed in chat or made on the
-- canvas, is one step: the validated edit operations, a short summary and the
-- document after it. Undo and Redo move studio_projects.cursor; a new edit after
-- an Undo drops the steps past the cursor. `said` is her chat instruction, kept
-- only after the PHI guard passed it.
create table practice_os.studio_steps (
  project_id uuid not null references practice_os.studio_projects (id) on delete cascade,
  seq integer not null check (seq > 0),
  source text not null check (source in ('chat', 'canvas', 'aeon')),
  said text check (said is null or char_length(said) <= 600),
  ops jsonb not null check (jsonb_typeof(ops) = 'array'),
  summary text not null check (char_length(summary) <= 300),
  doc jsonb not null check (jsonb_typeof(doc) = 'object'),
  created_at timestamptz not null default now(),
  primary key (project_id, seq)
);

alter table practice_os.studio_steps enable row level security;
