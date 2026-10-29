-- Publishing to Instagram is cut for now (Isaiah, 2026-10-29): an approved post ends
-- as 'ready', and she copies the caption and saves the picture to post it herself.
alter table practice_os.posts drop constraint posts_status_check;
alter table practice_os.posts add constraint posts_status_check
  check (status in ('idea', 'draft', 'pending_approval', 'ready', 'scheduled', 'publishing', 'published', 'failed', 'blocked'));
