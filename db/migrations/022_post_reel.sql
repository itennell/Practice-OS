-- 022: a short slide reel for a post (Instagram studio). Her picture, then 2-3
-- points, then how to book, 10-20 seconds. The video itself is made in her browser
-- and never stored; this keeps the slide words and the length she chose, after the
-- same safety check as a caption.
alter table practice_os.posts add column reel jsonb
  check (reel is null or (jsonb_typeof(reel) = 'object' and reel ? 'slides' and reel ? 'seconds'));
