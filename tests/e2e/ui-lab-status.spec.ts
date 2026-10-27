import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-010 Status Mark: the shared status icon and pill.

test.describe("Status Mark", () => {
  test("every status has a pill with its word", async ({ page }) => {
    await page.goto("/ui-lab/status");
    for (const word of ["Waiting", "In progress", "Done", "Failed", "Declined"]) {
      await expect(page.getByText(word, { exact: true }).first()).toBeVisible();
    }
  });

  test("a standalone mark names its status, and follows changes", async ({ page }) => {
    await page.goto("/ui-lab/status");
    await expect(page.getByRole("img", { name: "Waiting" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("img", { name: "Done" }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: "In progress, 40%" })).toBeVisible();
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.goto("/ui-lab/status");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("with reduced motion the marks hold still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ui-lab/status");
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page).toHaveScreenshot("status-mark-still.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
