import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-028 Confirm dialog: the shared "Are you sure?" box.

test.describe("Confirm dialog", () => {
  test("Cancel has focus first, Escape cancels and nothing happens", async ({ page }) => {
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Delete 3 files" }).click();
    const dialog = page.getByRole("alertdialog", { name: "Delete 3 files?" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Nothing yet.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Delete 3 files" })).toBeFocused();
  });

  test("focus stays inside the dialog", async ({ page }) => {
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Delete 3 files" }).click();
    const dialog = page.getByRole("alertdialog");
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      // Base UI routes focus through guard elements, so give it a moment to land.
      await expect.poll(() => dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    }
  });

  test("the action button repeats the action and runs it", async ({ page }) => {
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Delete 3 files" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete 3 files" }).click();
    await expect(page.getByRole("alertdialog")).toBeHidden();
    await expect(page.getByText("Deleted 3 files [Sample]")).toBeVisible();
  });

  test("a failure stays open and says why", async ({ page }) => {
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Disconnect Instagram" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Disconnect Instagram" }).click();
    await expect(page.getByRole("alert")).toContainText("Couldn't reach Instagram");
    await expect(page.getByRole("alertdialog")).toBeVisible();
  });

  test("the most serious action unlocks only after typing the practice name", async ({ page }) => {
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Delete all practice data" }).click();
    const dialog = page.getByRole("alertdialog");
    const go = dialog.getByRole("button", { name: "Delete all practice data" });
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Type Reyes Counseling PLLC to confirm").fill("Reyes Counseling");
    await expect(go).toBeDisabled();
    await dialog.getByLabel("Type Reyes Counseling PLLC to confirm").fill("Reyes Counseling PLLC");
    await expect(go).toBeEnabled();
  });

  test("has no serious or critical accessibility issues when open", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ui-lab/confirm-dialog");
    await page.getByRole("button", { name: "Delete all practice data" }).click();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("confirm-dialog-open.png", {
      maxDiffPixelRatio: 0.01,
      mask: [page.locator("nextjs-portal")],
    });
  });
});
