import { audit } from "../audit";
import { db } from "../db";
import { instagramAccount } from "../instagram/account";
import { InstagramGraph } from "../instagram/graph";
import { publishImagePost, publishProblems, type PublishProgress } from "../instagram/publish";
import { uploadPostImage } from "../instagram/relay";
import type { Executor } from "./types";

// She approved a post: publish it to her Instagram. The approval's payload names
// the post row; the caption, image and description are read from the row, so
// what she saw is what goes out. With DRY_RUN it checks everything Meta would
// and logs, without hosting the image or calling Instagram.

type PostRow = {
  id: string;
  caption: string;
  alt_text: string | null;
  image_jpeg: Buffer | null;
  status: string;
  approval_id: string | null;
  ig_container_id: string | null;
  ig_media_id: string | null;
  ig_permalink: string | null;
};

export const instagramPost: Executor = async (approval, { dryRun }) => {
  const postId = (approval.payload as { post_id?: unknown }).post_id;
  if (typeof postId !== "string") throw new Error("This approval has no post.");
  // Claims the post for this approval (it may run before saveDraft fills approval_id).
  const [post] = await db()<PostRow[]>`
    update practice_os.posts set approval_id = ${approval.id}
     where id = ${postId} and (approval_id is null or approval_id = ${approval.id})
    returning id, caption, alt_text, image_jpeg, status, approval_id, ig_container_id, ig_media_id, ig_permalink`;
  if (!post) throw new Error("That post no longer matches this approval.");
  if (post.status === "blocked") throw new Error("The safety check blocked this post, so it cannot be published.");
  if (!post.image_jpeg || !post.alt_text) throw new Error("This post has no finished image yet.");

  const input = { jpeg: Buffer.from(post.image_jpeg), caption: post.caption, altText: post.alt_text, aiGenerated: true };

  if (dryRun) {
    const problems = await publishProblems(input);
    if (problems.length) throw new Error(problems.join(" "));
    await audit({
      actor: "executor",
      action: "instagram_post_dry_run",
      approvalId: approval.id,
      subjectType: "post",
      subjectId: post.id,
      details: { caption_chars: post.caption.length, image_bytes: input.jpeg.length },
    });
    return { dryRun: true, post_id: post.id, would_publish: true };
  }

  const account = await instagramAccount();

  await db()`update practice_os.posts set status = 'publishing', failed_reason = null where id = ${post.id}`;
  const save = async (p: PublishProgress) => {
    await db()`
      update practice_os.posts
         set ig_container_id = ${p.containerId}, ig_media_id = ${p.mediaId}, ig_permalink = ${p.permalink},
             status = case when ${p.mediaId}::text is not null then 'published' else status end,
             published_at = case when ${p.mediaId}::text is not null then coalesce(published_at, now()) else published_at end
       where id = ${post.id}`;
  };

  try {
    const result = await publishImagePost(
      input,
      { containerId: post.ig_container_id, mediaId: post.ig_media_id, permalink: post.ig_permalink },
      { graph: new InstagramGraph(account.token), uploadImage: (jpeg) => uploadPostImage(jpeg), igUserId: account.igUserId, save },
    );
    await audit({
      actor: "executor",
      action: "instagram_published",
      approvalId: approval.id,
      subjectType: "post",
      subjectId: post.id,
      details: { media_id: result.mediaId, permalink: result.permalink, resumed: result.resumed, username: account.username },
    });
    return { post_id: post.id, media_id: result.mediaId, permalink: result.permalink, username: account.username };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db()`update practice_os.posts set status = 'failed', failed_reason = ${message} where id = ${post.id} and status = 'publishing'`;
    throw err;
  }
};
