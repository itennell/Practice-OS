import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-013 Spring Check: the shared checkbox.

test.describe("Spring Check", () => {
  test("click checks and unchecks, and the count follows", async ({ page }) => {
    await page.goto("/ui-lab/spring-check");
    const box = page.getByRole("checkbox", { name: "[Sample] Re-attest CAQH" });
    await expect(box).toHaveAttribute("aria-checked", "true");
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText("0 of 4 done")).toBeVisible();
  });

  test("Space and Enter toggle it, with a solid focus ring in the Caseload colour", async ({ page }) => {
    await page.goto("/ui-lab/spring-check");
    await page.keyboard.press("Tab");
    const first = page.getByRole("checkbox", { name: "[Sample] Log 3 CE hours for the license renewal" });
    await expect(first).toBeFocused();
    const ring = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.outlineStyle, width: s.outlineWidth, color: s.outlineColor };
    });
    expect(ring.style).toBe("solid");
    expect(ring.width).toBe("2px");
    expect(["rgb(91, 71, 201)", "rgb(176, 163, 251)"]).toContain(ring.color);
    await page.keyboard.press("Space");
    await expect(first).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-checked", "false");
  });

  test("the touch target is at least 44px tall", async ({ page }) => {
    await page.goto("/ui-lab/spring-check");
    const h = await page.getByRole("checkbox").first().evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(44);
  });

  test("disabled cannot be toggled", async ({ page }) => {
    await page.goto("/ui-lab/spring-check");
    await expect(page.getByRole("checkbox", { name: "[Sample] Disabled" })).toBeDisabled();
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.goto("/ui-lab/spring-check");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });

  test("with reduced motion it jumps straight to checked", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/ui-lab/spring-check");
    await page.getByRole("checkbox", { name: "[Sample] Pay Q4 estimated tax" }).click();
    await expect(page).toHaveScreenshot("spring-check-still.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
      mask: [page.locator("nextjs-portal")],
    });
  });
});
