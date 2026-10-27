import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-023 Attachment: the shared file and image card.

test.describe("Attachment", () => {
  test("a blocked image says why in words", async ({ page }) => {
    await page.goto("/ui-lab/attachment");
    await expect(page.getByText("Blocked: mentions self-harm. Posts cover practice logistics only.")).toBeVisible();
  });

  test("icon buttons are named after the file and are 44px", async ({ page }) => {
    await page.goto("/ui-lab/attachment");
    const remove = page.getByRole("button", { name: "Remove [Sample] first-session.jpg" });
    await expect(remove).toBeVisible();
    const box = await remove.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("link", { name: "Open [Sample] meet-the-clinician.jpg" })).toBeVisible();
  });

  test("remove takes the card out of the list", async ({ page }) => {
    await page.goto("/ui-lab/attachment");
    const list = page.getByRole("list", { name: "Post images" });
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await page.getByRole("button", { name: "Remove [Sample] first-session.jpg" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
  });

  test("processing finishes into ready with details", async ({ page }) => {
    await page.goto("/ui-lab/attachment");
    await expect(page.getByText("Converting to JPEG…")).toBeVisible();
    await page.getByRole("button", { name: "Finish processing" }).click();
    await expect(page.getByText("Converting to JPEG…")).toHaveCount(0);
    await expect(page.getByText("JPEG · 1080 × 1080 · 204 KB")).toHaveCount(2);
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ui-lab/attachment");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("attachment.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
