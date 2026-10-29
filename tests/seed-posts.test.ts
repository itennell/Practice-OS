import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { checkInstagramJpeg } from "../lib/instagram/image";
import { SEED_POSTS } from "../scripts/seed-posts";

// The demo's [Sample] posts must survive `npm run db:reset` in a state she can approve:
// a finished picture, a headline, and the pending one linked to its approval.
describe("seeded Instagram posts", async () => {
  const sql = await readFile("db/seed/demo.sql", "utf8");

  it("each picture is a valid Instagram JPEG", async () => {
    for (const post of SEED_POSTS.filter((p) => p.picture)) {
      expect(await checkInstagramJpeg(await readFile(`db/seed/posts/${post.id}.jpg`)), post.id).toEqual([]);
    }
  });

  it("each post in the seed has the headline its picture shows", () => {
    for (const post of SEED_POSTS) expect(sql).toContain(`('${post.id}', '`);
    for (const post of SEED_POSTS) expect(sql).toMatch(new RegExp(`'${post.id}', '[a-z_]+', '${post.headline.replace(/[[\]]/g, "\\$&")}'`));
  });

  it("the pending post points at its approval, so the board counts it as waiting", () => {
    expect(sql).toMatch(/update practice_os\.posts set approval_id = '00000000-0000-4000-8000-000000000902'\s+where id = '00000000-0000-4000-8000-000000000301'/);
  });
});
