-- 021: research before a post (Instagram studio). For the topic she types, three
-- small Muse web searches find what therapists post about it, which hooks and
-- formats work and why; the result is a short summary and 2-3 angles with the
-- links they came from. Saved so the same topic within a week isn't searched
-- again, and so a post can point back at the research behind it.
create table practice_os.post_research (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (char_length(topic) between 1 and 300),
  summary text not null check (char_length(summary) <= 400),
  angles jsonb not null default '[]'::jsonb,
  sources jsonb not null default '[]'::jsonb,
  source text not null check (source in ('web', 'fixed')),
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create index post_research_topic_idx on practice_os.post_research (lower(topic), created_at desc);

alter table practice_os.post_research enable row level security;

alter table practice_os.posts add column research_id uuid references practice_os.post_research (id) on delete set null;
