import { audit } from "../audit";
import { db } from "../db";
import type { Executor } from "./types";

// She approved a post: it's ready for her to post herself. Publishing to Instagram
// is cut for now (Isaiah, 2026-10-29), so this never calls the Graph API or the
// Connect relay. lib/instagram/publish.ts and relay/ stay in the repo, unreachable.
// The post is marked ready and the Instagram page shows a copy-caption button, the
// picture to download and the steps to post it in the Instagram app. Nothing leaves
// the app, so DRY_RUN changes nothing here except the audit line.

type PostRow = { id: string; status: string; image_jpeg: Buffer | null };

export const NO_PICTURE = "Aeon couldn't finish the picture. Try again.";

export const instagramPost: Executor = async (approval, { dryRun }) => {
  const postId = (approval.payload as { post_id?: unknown }).post_id;
  if (typeof postId !== "string") throw new Error("This approval has no post.");
  // Claims the post for this approval (it may run before saveDraft fills approval_id).
  const [post] = await db()<PostRow[]>`
    update practice_os.posts set approval_id = ${approval.id}
     where id = ${postId} and (approval_id is null or approval_id = ${approval.id})
    returning id, status, image_jpeg`;
  if (!post) throw new Error("That post no longer matches this approval.");
  if (post.status === "blocked") throw new Error("The safety check blocked this post, so it can't be marked ready.");
  if (!post.image_jpeg) {
    // She sees this on the post card (with Retry) and in Approvals; the post stays on the board.
    await db()`update practice_os.posts set status = 'failed', failed_reason = ${NO_PICTURE} where id = ${post.id}`;
    throw new Error(NO_PICTURE);
  }

  await db()`update practice_os.posts set status = 'ready', failed_reason = null where id = ${post.id}`;
  await audit({
    actor: "executor",
    action: "instagram_post_ready",
    approvalId: approval.id,
    subjectType: "post",
    subjectId: post.id,
    details: { dry_run: dryRun, published: false },
  });
  return { post_id: post.id, ready: true, posted: false, ...(dryRun ? { dryRun: true } : {}), next: "Copy the caption and save the picture from the Instagram page, then post it in the Instagram app." };
};
