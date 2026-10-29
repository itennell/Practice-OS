import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// The Instagram studio against live Muse Spark (writer and safety check), with the
// plain picture stand-in (PLAYWRIGHT_IMAGE_STANDIN=1, no image models). Runs only
// when MODEL_API_KEY is set for the test server; CI without a key skips it.

test.skip(!process.env.MODEL_API_KEY, "needs a Muse key (live model calls)");

test("Write one post, then plan 3; each waits for her approval as a preview", async ({ page }) => {
  test.setTimeout(600_000);
  execSync("npm run db:reset", { stdio: "ignore" });
  await page.goto("/instagram");
  const box = page.getByLabel("What should the post be about?");
  await expect(page.getByText(/waiting for you ·/)).toBeVisible();
  const posts = page.locator("#posts-heading").locator("xpath=../..").locator(":scope > ul > li");
  const before = await posts.count();

  await box.fill("how superbills work for out-of-network clients");
  await page.getByRole("button", { name: "Write this post" }).click();
  await expect(page.getByText(/is ready for you to look at|wrote a different post instead/)).toBeVisible({ timeout: 240_000 });
  await expect(posts).toHaveCount(before + 1);

  await box.fill("what to bring to your first session");
  // The slider starts at 3.
  await expect(page.getByRole("slider", { name: "Posts" })).toHaveAttribute("aria-valuetext", "3 posts");
  await page.getByRole("button", { name: "Plan several" }).click();
  await expect(page.getByText(/posts are ready for you to look at/)).toBeVisible({ timeout: 480_000 });
  await expect(posts).toHaveCount(before + 4);
  // New posts come first; the four newest each wait with Approve / Decline under the preview.
  for (let i = 0; i < 4; i++) await expect(posts.nth(i).getByRole("button", { name: "Approve" })).toBeVisible();
  await expect(page.getByRole("button", { name: "more of the caption" }).first()).toBeVisible();
});
