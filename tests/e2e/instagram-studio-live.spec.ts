import { expect, test } from "@playwright/test";
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import sharp from "sharp";

// The Instagram studio end to end against live Muse (writer, safety check, picture
// and picture check). Runs only when MODEL_API_KEY is set for the test server; CI
// without a key skips it. Takes several minutes.

test.skip(!process.env.MODEL_API_KEY, "needs a Muse key (live model calls)");

test("Write one post, plan 3, approve one, then download its JPEG and MP4", async ({ page }) => {
  test.setTimeout(1_200_000);
  execSync("npm run db:reset", { stdio: "ignore" });
  await page.goto("/instagram");
  const box = page.getByLabel("What should the post be about?");
  await expect(page.getByText(/waiting for you ·/)).toBeVisible();
  const posts = page.locator("#posts-heading").locator("xpath=../..").locator(":scope > ul > li");
  const before = await posts.count();

  await box.fill("how superbills work for out-of-network clients");
  await page.getByRole("button", { name: "Write this post" }).click();
  // Research first: a summary and 2-3 angles with their links; she picks the first.
  const panel = page.getByRole("region", { name: "What other therapists post about this" });
  await expect(panel).toBeVisible({ timeout: 180_000 });
  await panel.getByRole("button", { name: /^Write this one/ }).first().click();
  await expect(page.getByText(/is ready for you to look at|wrote a different post instead/)).toBeVisible({ timeout: 240_000 });
  await expect(posts).toHaveCount(before + 1);

  await box.fill("what to bring to your first session");
  // The slider starts at 3.
  await expect(page.getByRole("slider", { name: "Posts" })).toHaveAttribute("aria-valuetext", "3 posts");
  await page.getByRole("button", { name: "Plan several" }).click();
  await expect(panel).toBeVisible({ timeout: 180_000 });
  await panel.getByRole("button", { name: /^Plan 3 from this/ }).first().click();
  await expect(page.getByText(/posts are ready for you to look at/)).toBeVisible({ timeout: 900_000 });
  await expect(posts).toHaveCount(before + 4);
  // New posts come first; the four newest each wait with Approve / Decline under the preview.
  for (let i = 0; i < 4; i++) await expect(posts.nth(i).getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByRole("button", { name: "more of the caption" }).first()).toBeVisible();

  // Approve the newest post, then take it home: the picture and a reel.
  const first = posts.first();
  await first.getByRole("button", { name: "Approve" }).click();
  await expect(first.getByRole("button", { name: "Copy caption" })).toBeVisible({ timeout: 30_000 });
  const [jpeg] = await Promise.all([page.waitForEvent("download"), first.getByRole("link", { name: /Picture 4:5/ }).click()]);
  const meta = await sharp(readFileSync((await jpeg.path())!)).metadata();
  expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", 1080, 1350]);
  await first.getByRole("button", { name: "Make a reel" }).click();
  const editor = first.getByRole("region", { name: "Your reel" });
  await expect(editor).toBeVisible({ timeout: 120_000 });
  const [mp4] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), editor.getByRole("button", { name: "Download reel (MP4)" }).click()]);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height:format=duration", "-of", "json", (await mp4.path())!], { encoding: "utf8" }));
  expect(probe.streams[0]).toMatchObject({ codec_name: "h264", width: 1080, height: 1920 });
  if (process.env.STUDIO_PROOF_DIR) {
    await jpeg.saveAs(`${process.env.STUDIO_PROOF_DIR}/live-post.jpg`);
    await mp4.saveAs(`${process.env.STUDIO_PROOF_DIR}/live-reel.mp4`);
  }
});
