import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-014 Thought Line: Aeon's working line with steps.

test.describe("Thought Line", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-lab/thought-line");
    await expect(page.getByRole("button", { name: "Start" })).toBeEnabled();
  });

  test("works through steps, then settles and folds them away", async ({ page }) => {
    await page.getByRole("button", { name: "Start" }).click();
    const toggle = page.getByRole("button", { name: /Drafting posts….*Hide steps/ });
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    // The plan shows up front: the first task in progress, the rest coming up.
    await expect(page.getByText("[Sample] Read your practice details, in progress")).toBeAttached();
    await expect(page.getByText("[Sample] Drafted 3 posts, coming up")).toBeAttached();
    // Tasks tick off as they finish.
    await expect(page.getByText("[Sample] Read your practice details, done")).toBeAttached({ timeout: 4_000 });
    const settled = page.getByRole("button", { name: /Drafted 3 posts.*Show steps/ });
    await expect(settled).toBeVisible({ timeout: 10_000 });
    await expect(settled).toHaveAttribute("aria-expanded", "false");
    await settled.click();
    await expect(page.getByRole("button", { name: /Drafted 3 posts.*Hide steps/ })).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("[Sample] Checked the posting rules", { exact: false })).toBeVisible();
  });

  test("a task that didn't work says so in words", async ({ page }) => {
    await expect(page.getByText("[Sample] Couldn't reach the fax list, didn't work")).toBeAttached();
  });

  test("announces work and the result to screen readers", async ({ page }) => {
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Drafting posts…" })).toBeAttached();
    await expect(page.getByRole("status").filter({ hasText: "Drafted 3 posts" })).toBeAttached({ timeout: 10_000 });
  });

  test("the toggle is a 44px target with a visible focus ring", async ({ page }) => {
    await page.getByRole("button", { name: "Start" }).click();
    const toggle = page.getByRole("button", { name: /Drafting posts….*Hide steps/ });
    expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.locator("h1").click();
    await page.keyboard.press("Tab");
    await expect(toggle).toBeFocused();
    expect(await toggle.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Start" }).click();
    await expect(page.getByRole("button", { name: /Drafted 3 posts.*Show steps/ })).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Drafted 3 posts.*Show steps/ }).click();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
