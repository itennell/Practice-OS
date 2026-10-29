-- 015: Instagram posts carry what publishing needs.
--
-- practice_os.posts (001) already holds drafts. This adds the fifth content
-- pillar (office and telehealth details), the headline drawn on the graphic, the
-- image description for screen readers (Meta's alt_text, up to 1,000 chars), the
-- finished 1080x1350 JPEG, what the critic and the graphic check found, the
-- approval that publishes it, and the ids Meta returns. The container id is saved
-- before publishing, so a retry never posts twice.

alter table practice_os.posts drop constraint posts_topic_check;
alter table practice_os.posts add constraint posts_topic_check
  check (topic in ('first_session', 'fees_superbills', 'how_to_book', 'meet_the_clinician', 'office_telehealth', 'other'));

alter table practice_os.posts drop constraint posts_status_check;
alter table practice_os.posts add constraint posts_status_check
  check (status in ('idea', 'draft', 'pending_approval', 'scheduled', 'publishing', 'published', 'failed', 'blocked'));

alter table practice_os.posts
  add column week_of date,
  add column headline text check (headline is null or char_length(headline) between 1 and 80),
  add column alt_text text check (alt_text is null or char_length(alt_text) between 1 and 1000),
  add column image_jpeg bytea check (image_jpeg is null or octet_length(image_jpeg) <= 8388608),
  add column critic jsonb not null default '{}'::jsonb,
  add column graphic_check jsonb,
  add column approval_id uuid references practice_os.approvals (id),
  add column ig_container_id text,
  add column ig_permalink text,
  add column failed_reason text;

alter table practice_os.posts add constraint posts_caption_length check (char_length(caption) <= 2200);

create index posts_week_idx on practice_os.posts (week_of, created_at);
create unique index posts_approval_idx on practice_os.posts (approval_id) where approval_id is not null;
