import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Calm redesign: the shell and the main screens have no axe issues at any size
// (desktop light and dark, phone, 200% zoom as a 720px window, 320px wide).

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function violations(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

for (const path of ["/", "/approvals", "/admin", "/settings"]) {
  test(`${path} has no axe issues and no sideways scroll`, async ({ page }) => {
    await page.goto(path);
    expect(await violations(page)).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("The menu has no axe issues when open, and every row is at least 44px tall", async ({ page }) => {
  await page.goto("/approvals");
  await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: "Open menu" });
  const phone = await button.isVisible();
  if (phone) await button.click();
  const menu = phone ? page.getByRole("dialog", { name: "Menu" }) : page.locator("aside");
  await expect(menu.getByRole("button", { name: "New chat" })).toBeVisible();
  expect(await violations(page)).toEqual([]);
  for (const link of await menu.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
});
