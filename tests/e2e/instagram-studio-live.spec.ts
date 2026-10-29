import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// The Instagram studio end to end against live Muse (writer, safety check, picture
// and picture check). Runs only when MODEL_API_KEY is set for the test server; CI
// without a key skips it. Takes several minutes.

test.skip(!process.env.MODEL_API_KEY, "needs a Muse key (live model calls)");

test("Write one post, then plan 3; each waits for her approval as a preview", async ({ page }) => {
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
});
