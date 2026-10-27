import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-031 Toasts: the shared notifications.

test.describe("Toasts", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-lab/toasts");
    await page.waitForLoadState("networkidle");
  });

  test("success shows and fades on its own", async ({ page }) => {
    await page.getByRole("button", { name: "Success" }).click();
    const t = page.getByText("Text sent to [Sample] Sam Example");
    await expect(t).toBeVisible();
    await expect(t).toBeHidden({ timeout: 8_000 });
  });

  test("an error says the fix and stays until dismissed", async ({ page }) => {
    await page.getByRole("button", { name: "Error", exact: true }).click();
    await expect(page.getByText("Reconnect it in Settings. Nothing was sent.")).toBeVisible();
    await page.waitForTimeout(5_000);
    await expect(page.getByText("Couldn't reach Gmail.")).toBeVisible();
    const close = page.getByRole("button", { name: /close/i });
    expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
    await close.click();
    await expect(page.getByText("Couldn't reach Gmail.")).toBeHidden();
  });

  test("working turns into done, or into the error", async ({ page }) => {
    await page.getByRole("button", { name: "Working, then done" }).click();
    await expect(page.getByText("Publishing post…")).toBeVisible();
    await expect(page.getByText("Post published")).toBeVisible({ timeout: 4_000 });
    await page.getByRole("button", { name: "Working, then fails" }).click();
    await expect(page.getByText("Couldn't save the draft. Check the Gmail connection in Settings.")).toBeVisible({ timeout: 4_000 });
  });

  test("toasts live in a labelled region screen readers announce", async ({ page }) => {
    await page.getByRole("button", { name: "Info" }).click();
    await expect(page.getByText("Aeon queued 2 drafts for your approval.")).toBeVisible();
    const region = page.getByRole("region", { name: /Notifications/ });
    await expect(region).toBeAttached();
    await expect(region).toHaveAttribute("aria-live", "polite");
  });

  test("sits bottom-right on desktop and at the top on phones", async ({ page, isMobile }) => {
    await page.getByRole("button", { name: "Info" }).click();
    const box = (await page.locator("[data-sonner-toast]").first().boundingBox())!;
    const vp = page.viewportSize()!;
    if (isMobile) expect(box.y).toBeLessThan(vp.height / 3);
    else {
      expect(box.y).toBeGreaterThan(vp.height / 2);
      expect(box.x).toBeGreaterThan(vp.width / 2);
    }
  });

  test("has no serious or critical accessibility issues with toasts showing", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Error", exact: true }).click();
    await page.getByRole("button", { name: "Info" }).click();
    await expect(page.getByText("Aeon queued 2 drafts for your approval.")).toBeVisible();
    await page.waitForTimeout(600);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("toasts.png", { maxDiffPixelRatio: 0.02, mask: [page.locator("nextjs-portal")] });
  });
});
