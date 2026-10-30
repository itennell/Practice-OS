-- 028: the studio's pictures, one per version (doc.picture), so Undo after
-- "swap the picture" brings the old picture back. JPEG only (Instagram needs
-- JPEG); her own video frames are never stored.
create table practice_os.studio_pictures (
  project_id uuid not null references practice_os.studio_projects (id) on delete cascade,
  version integer not null check (version >= 0),
  jpeg bytea not null,
  created_at timestamptz not null default now(),
  primary key (project_id, version)
);

alter table practice_os.studio_pictures enable row level security;
