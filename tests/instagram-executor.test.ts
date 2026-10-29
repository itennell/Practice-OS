// The instagram_post executor in DRY_RUN, through the real approve() path.
// Database tests: run only when DATABASE_URL is set (a throwaway local Postgres).
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it, vi } from "vitest";
import { approve } from "../lib/approvals";
import { closeDb, db } from "../lib/db";
import { toInstagramJpeg } from "../lib/instagram/image";

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

describe.skipIf(!hasDb)("instagram_post executor (DRY_RUN)", () => {
  it("checks the post and logs it without calling Instagram or the relay", async () => {
    process.env.DRY_RUN = "true";
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { approvalId } = await draftPost();
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.status).toBe("done");
    expect(r.ok && r.approval.result).toMatchObject({ dryRun: true, would_publish: true });
    expect(fetchSpy).not.toHaveBeenCalled();
    const [log] = await db()`select action from practice_os.audit_log where approval_id = ${approvalId} and action = 'instagram_post_dry_run'`;
    expect(log).toBeTruthy();
    fetchSpy.mockRestore();
  });

  it("never publishes a post the safety check blocked", async () => {
    const { approvalId } = await draftPost({ blocked: true });
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.status).toBe("failed");
    expect(r.ok && r.approval.error).toMatch(/blocked/);
  });

  it("fails clearly when the image is missing", async () => {
    const { approvalId } = await draftPost({ image: false });
    const r = await approve(approvalId, { by: "test" });
    expect(r.ok && r.approval.error).toMatch(/no finished image/);
  });
});
