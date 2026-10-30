-- 026: the chat-first studio (Media > Instagram). One row per thing she is making:
-- a post, carousel, slide reel or her own video. `doc` is the current document
-- (lib/studio/doc.ts); `base_doc` is how it started, so Undo can go all the way
-- back. Her video files are never stored here: a clip keeps only a key into her
-- browser's private storage and the times she picked.
create table practice_os.studio_projects (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references practice_os.posts (id) on delete set null,
  research_id uuid references practice_os.post_research (id) on delete set null,
  doc jsonb not null check (jsonb_typeof(doc) = 'object' and doc ? 'kind'),
  base_doc jsonb not null check (jsonb_typeof(base_doc) = 'object'),
  -- How many edit steps are applied (studio_steps.seq <= cursor); Undo lowers it.
  cursor integer not null default 0 check (cursor >= 0),
  is_sample boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index studio_projects_updated_idx on practice_os.studio_projects (updated_at desc);

alter table practice_os.studio_projects enable row level security;
