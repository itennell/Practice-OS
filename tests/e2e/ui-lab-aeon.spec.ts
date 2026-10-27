import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-017 Liquid Aeon test page. The live blob is animated WebGL, so it is
// checked for structure and accessibility; pixel baselines use the still orbs.

test.describe("Liquid Aeon test page", () => {
  test("shows a live blob for Aeon and each helper, with plain-words names", async ({ page }) => {
    await page.goto("/ui-lab/aeon");
    // Headless Chrome draws WebGL in software, so the blobs take a moment to start.
    await expect(page.locator("canvas")).toHaveCount(7, { timeout: 20_000 });
    await expect(page.getByRole("img", { name: "Aeon is resting" }).first()).toBeVisible({ timeout: 10_000 });
    for (const name of ["Front Desk", "Referrals", "Instagram"]) {
      await expect(page.getByRole("img", { name: `${name} is resting` }).first()).toBeVisible();
    }

    await page.getByRole("button", { name: "Working" }).click();
    await expect(page.getByRole("img", { name: "Aeon is working" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Working" })).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Pop up again" }).click();
    await expect(page.locator('[data-state="pop"]').first()).toBeVisible();
    await expect(page.locator('[data-state="pop"]')).toHaveCount(0, { timeout: 4_000 });

    await page.getByRole("button", { name: "Eyes off" }).click();
    await expect(page.getByRole("button", { name: "Eyes off" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Eyes on" })).toHaveAttribute("aria-pressed", "false");
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.goto("/ui-lab/aeon");
    await expect(page.locator("canvas")).toHaveCount(7, { timeout: 20_000 });
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("with reduced motion every blob is a still orb and nothing animates", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ui-lab/aeon");
    await expect(page.getByRole("img", { name: "Aeon is resting" }).first()).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
    await expect(page.locator('[data-state="pop"]')).toHaveCount(0);
    await expect(page).toHaveScreenshot("liquid-aeon-still.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });

  test("keyboard reaches every control with a visible focus ring", async ({ page }) => {
    await page.goto("/ui-lab/aeon");
    const names = ["Resting", "Working", "Pop up again", "Liquid metal", "Chrome", "Jelly", "Eyes on", "Eyes off"];
    for (const name of names) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      await expect(focused).toHaveAccessibleName(name);
      const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).toBe("solid");
    }
  });
});
