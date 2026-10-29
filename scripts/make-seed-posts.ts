import { writeFile } from "node:fs/promises";
import sharp from "sharp";
import { composePost } from "../lib/instagram/graphic";
import { checkInstagramJpeg, POST_HEIGHT, POST_WIDTH } from "../lib/instagram/image";
import { SEED_POSTS } from "./seed-posts";

// Draws the pictures for the [Sample] posts in db/seed/demo.sql, so the demo post
// can be approved after `npm run db:reset` (the executor needs a finished picture).
// Plain code, no model: a warm two-tone background with the post's headline and
// Dana's footer, drawn by the same composePost the app uses. Run once and commit:
//   npx tsx scripts/make-seed-posts.ts
async function background(top: string, bottom: string): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${POST_WIDTH}" height="${POST_HEIGHT}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

for (const post of SEED_POSTS.filter((p) => p.picture)) {
  const jpeg = await composePost({
    background: await background(post.picture!.top, post.picture!.bottom),
    cutout: null,
    words: { headline: post.headline, practiceName: "Reyes Counseling PLLC", licenseLine: "Dana Reyes, LCPC (fictional demo practice)" },
  });
  const problems = await checkInstagramJpeg(jpeg);
  if (problems.length) throw new Error(`${post.id}: ${problems.join("; ")}`);
  await writeFile(`db/seed/posts/${post.id}.jpg`, jpeg);
  console.log(`db/seed/posts/${post.id}.jpg (${Math.round(jpeg.length / 1024)} KB)`);
}
