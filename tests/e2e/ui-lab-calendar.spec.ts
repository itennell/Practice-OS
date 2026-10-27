import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-030 Calendar: the shared month calendar. The lab pins "today" to Oct 27, 2026.

test.describe("Calendar", () => {
  test("weeks start on Sunday and each day says what is due", async ({ page }) => {
    await page.goto("/ui-lab/calendar");
    // Every row starts on a Sunday (day labels carry the weekday; the header row is hidden from screen readers).
    const firsts = await page.getByRole("row").evaluateAll((rows) =>
      rows.map((r) => r.querySelector('[role="gridcell"] button')?.getAttribute("aria-label") ?? "").filter(Boolean),
    );
    expect(firsts.length).toBe(6);
    for (const label of firsts) expect(label).toMatch(/^Sunday,/);
    await expect(
      page.getByRole("button", {
        name: "Wednesday, November 4, 2026, selected: [Sample] CAQH re-attestation due; [Sample] consult with Jordan Lee at 10 am",
      }),
    ).toBeVisible();
  });

  test("today is marked and named", async ({ page }) => {
    await page.goto("/ui-lab/calendar");
    await page.getByRole("button", { name: /previous month/i }).click();
    await expect(page.getByRole("button", { name: "Tuesday, October 27, 2026, today" })).toBeVisible();
  });

  test("arrow keys move between days and Enter picks one", async ({ page }) => {
    await page.goto("/ui-lab/calendar");
    // Wait for the page's scripts, or the keys reach plain buttons with no handlers yet.
    await page.waitForLoadState("networkidle");
    const start = page.getByRole("button", { name: /^Wednesday, November 4, 2026/ });
    await start.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /^Thursday, November 5, 2026/ })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("button", { name: /^Thursday, November 12, 2026/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "Thursday, November 12" })).toBeVisible();
    await expect(page.getByText("Nothing on this day.")).toBeVisible();
  });

  test("day cells are at least 40px (44px on phones)", async ({ page, isMobile }) => {
    await page.goto("/ui-lab/calendar");
    const w = await page.getByRole("button", { name: /^Thursday, November 5, 2026/ }).evaluate((el) => el.getBoundingClientRect().width);
    expect(w).toBeGreaterThanOrEqual(isMobile ? 44 : 40);
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.goto("/ui-lab/calendar");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("calendar.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
