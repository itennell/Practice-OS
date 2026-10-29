// The instagram_post executor through the real approve() path. Publishing is cut for
// now: approving marks the post ready for her to post herself, with or without DRY_RUN,
// and never calls Instagram or the relay.
// Database tests: run only when DATABASE_URL is set (a throwaway local Postgres).
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { approve } from "../lib/approvals";
import { closeDb, db } from "../lib/db";
import { toInstagramJpeg } from "../lib/instagram/image";
import { retryPost } from "../lib/instagram/store";

const hasDb = Boolean(process.env.DATABASE_URL);
const made: string[] = [];

async function draftPost(opts: { blocked?: boolean; image?: boolean } = {}) {
  const jpeg = opts.image === false ? null : await toInstagramJpeg(readFileSync("public/demo/dana-reyes-headshot.jpg"));
  const [a] = await db()<{ id: string }[]>`
    insert into practice_os.approvals (kind, title, payload, status, created_by)
    values ('instagram_post', '[Sample] test post', '{}', 'pending', 'test') returning id`;
  const [p] = await db()<{ id: string }[]>`
    insert into practice_os.posts (topic, caption, headline, alt_text, image_jpeg, status, blocked_reason, approval_id, is_sample)
    values ('how_to_book', 'How to book. Dana Reyes, LCPC (fictional demo practice)', 'How to book',
            'Dana at her desk', ${jpeg}, ${opts.blocked ? "blocked" : "pending_approval"},
            ${opts.blocked ? "test" : null}, ${a.id}, true)
    returning id`;
  await db()`update practice_os.approvals set payload = ${db().json({ post_id: p.id })} where id = ${a.id}`;
  made.push(a.id);
  return { approvalId: a.id, postId: p.id };
}

afterAll(async () => {
  if (!hasDb) return;
  await db()`delete from practice_os.posts where approval_id in ${db()(made)}`;
  await closeDb();
});

describe.skipIf(!hasDb)("instagram_post executor (no publishing)", () => {
  it.each([["true"], ["false"]])("DRY_RUN=%s: marks the post ready, audits it, and never calls Instagram or the relay", async (dry) => {
    process.env.DRY_RUN = dry;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { approvalId, postId } = await draftPost();
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.status).toBe("done");
    expect(r.ok && r.approval.result).toMatchObject({ ready: true, posted: false, ...(dry === "true" ? { dryRun: true } : {}) });
    expect(fetchSpy).not.toHaveBeenCalled();
    const [post] = await db()`select status, ig_media_id from practice_os.posts where id = ${postId}`;
    expect(post).toEqual({ status: "ready", ig_media_id: null });
    const [log] = await db()`select details from practice_os.audit_log where approval_id = ${approvalId} and action = 'instagram_post_ready'`;
    expect(log.details).toMatchObject({ published: false, dry_run: dry === "true" });
    fetchSpy.mockRestore();
    process.env.DRY_RUN = "true";
  });

  it("never marks ready a post the safety check blocked", async () => {
    const { approvalId } = await draftPost({ blocked: true });
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.status).toBe("failed");
    expect(r.ok && r.approval.error).toMatch(/blocked/);
  });

  it("fails clearly when the image is missing", async () => {
    const { approvalId, postId } = await draftPost({ image: false });
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.error).toBe("Aeon couldn't finish the picture. Try again.");
    // The post stays on her board with the same words, so the card can offer Retry.
    const [post] = await db()<{ status: string; failed_reason: string }[]>`select status, failed_reason from practice_os.posts where id = ${postId}`;
    expect(post).toEqual({ status: "failed", failed_reason: "Aeon couldn't finish the picture. Try again." });

    // Retry draws the picture again and queues a fresh approval; a second retry while it waits is refused.
    process.env.PLAYWRIGHT_IMAGE_STANDIN = "1";
    try {
      // Two Retries at once: exactly one claims the post and queues an approval.
      const both = await Promise.all([retryPost("test", postId), retryPost("test", postId)]);
      expect(both.filter((x) => x.ok)).toHaveLength(1);
      expect(both.find((x) => !x.ok)).toMatchObject({ ok: false, status: 409 });
      const again = both.find((x) => x.ok)!;
      if (!again.ok) return;
      made.push(again.approvalId);
      const [after] = await db()<{ status: string; failed_reason: string | null; has_image: boolean; approval_id: string }[]>`
        select status, failed_reason, image_jpeg is not null as has_image, approval_id from practice_os.posts where id = ${postId}`;
      expect(after).toEqual({ status: "pending_approval", failed_reason: null, has_image: true, approval_id: again.approvalId });
      expect(await retryPost("test", postId)).toMatchObject({ ok: false, status: 409 });
      // A finished draft is sent to her approvals with its own picture (no new drawing).
      const jpeg = await toInstagramJpeg(readFileSync("public/demo/dana-reyes-headshot.jpg"));
      const [d] = await db()<{ id: string }[]>`
        insert into practice_os.posts (topic, caption, headline, image_jpeg, status, is_sample)
        values ('how_to_book', 'Book from the link in bio.', 'A draft', ${jpeg}, 'draft', true) returning id`;
      const sent = await retryPost("test", d.id, { graphic: { background: async () => { throw new Error("must not draw"); } } });
      expect(sent.ok).toBe(true);
      if (sent.ok) made.push(sent.approvalId);
      const [row] = await db()<{ status: string; same: boolean }[]>`select status, image_jpeg = ${jpeg} as same from practice_os.posts where id = ${d.id}`;
      expect(row).toEqual({ status: "pending_approval", same: true });
      // A declined post is never retried.
      const [r] = await db()<{ id: string }[]>`
        insert into practice_os.approvals (kind, title, payload, status, created_by, decided_at, decided_by) values ('instagram_post', 'declined one', '{}', 'rejected', 'test', now(), 'test') returning id`;
      made.push(r.id);
      const [q] = await db()<{ id: string }[]>`
        insert into practice_os.posts (topic, caption, headline, status, approval_id, is_sample)
        values ('how_to_book', 'Book.', 'Declined', 'pending_approval', ${r.id}, true) returning id`;
      expect(await retryPost("test", q.id)).toMatchObject({ ok: false, status: 409 });
    } finally {
      delete process.env.PLAYWRIGHT_IMAGE_STANDIN;
    }
  });
});
