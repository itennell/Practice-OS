import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-029 Avatar: the shared profile picture.

test.describe("Avatar", () => {
  test("is named by the person, shows initials, and says what the dot means", async ({ page }) => {
    await page.goto("/ui-lab/avatar");
    const dana = page.getByRole("img", { name: "Dana Reyes, LCPC", exact: true }).first();
    await expect(dana).toHaveText("DR");
    await expect(page.getByRole("img", { name: "Dana Reyes, LCPC, connected" })).toBeVisible();
  });

  test("the three sizes are 32, 40 and 72 pixels", async ({ page }) => {
    await page.goto("/ui-lab/avatar");
    const sizes = await page
      .getByRole("img", { name: "Dana Reyes, LCPC", exact: true })
      .evaluateAll((els) => els.slice(0, 3).map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(sizes).toEqual([32, 40, 72]);
  });

  test("a caller with only a number gets a person icon, and a broken photo falls back to initials", async ({ page }) => {
    await page.goto("/ui-lab/avatar");
    await expect(page.getByRole("img", { name: "(312) 555-0142" }).locator("svg")).toBeVisible();
    await expect(page.getByRole("img", { name: "[Sample] Alex Kim" })).toHaveText("AK", { timeout: 5_000 });
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.goto("/ui-lab/avatar");
    await expect(page.getByRole("img", { name: "[Sample] Alex Kim" })).toHaveText("AK", { timeout: 5_000 });
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("avatar.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
