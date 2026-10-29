import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// The dark chat menu (UI-005): the same menu on desktop (left column) and phones (slides in).

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function openMenu(page: Page) {
  // Wait for hydration, or the click lands before the menu button is wired up.
  await page.waitForLoadState("networkidle");
  const button = page.getByRole("button", { name: "Open menu" });
  if (await button.isVisible()) {
    await button.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    return page.getByRole("dialog", { name: "Menu" });
  }
  return page.locator("aside").filter({ visible: true });
}

async function serious(page: Page) {
  // Let the slide-in finish: axe measures text mid-transition as low contrast.
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Menu: Aeon, New chat, search, practice links with counts, recent chats and Dana", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts draft-gfe", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto("/approvals");
  const menu = await openMenu(page);

  await expect(menu.getByRole("button", { name: "New chat" })).toBeVisible();
  await expect(menu.getByRole("searchbox", { name: "Search chats" })).toBeVisible();
  const main = menu.getByRole("navigation", { name: "Main" });
  for (const name of [/^Admin/, /^Approvals/, "Referrals", "Media", "Front Desk"]) {
    await expect(main.getByRole("link", { name })).toBeVisible();
  }
  // The seeded practice has approvals waiting; the count is part of the link's name.
  await expect(main.getByRole("link", { name: /^Approvals \d+ waiting$/ })).toHaveAttribute("aria-current", "page");
  await expect(menu.getByRole("link", { name: /Dana Reyes, LCPC/ })).toBeVisible();
  await expect(menu.getByText("Fictional demo practice")).toBeVisible();

  const chat = main.getByRole("link", { name: /Good Faith Estimate/ }).first();
  await expect(chat).toHaveAttribute("href", `/?c=${id}`);
  await menu.getByRole("searchbox", { name: "Search chats" }).fill("zzz nothing");
  await expect(menu.getByText("No chat matches that.")).toBeVisible();
  await menu.getByRole("searchbox", { name: "Search chats" }).fill("");
  expect(await serious(page)).toEqual([]);

  await chat.click();
  await expect(page).toHaveURL(new RegExp(`\\?c=${id}`));
  await expect(page.getByRole("log", { name: "Conversation" })).toBeVisible();

  // New chat clears the open chat and goes back to the greeting.
  const again = await openMenu(page);
  await again.getByRole("button", { name: "New chat" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /^(Good (morning|afternoon|evening)|Hello)\b/ })).toBeVisible();
  await expect(page.getByRole("log", { name: "Conversation" })).toHaveCount(0);
});

test("The chat page has no floating New chat button or second chat list", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("main").getByRole("button", { name: /New chat|Your chats/ })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Your chats with Aeon" })).toHaveCount(0);
});

test("Phones: the menu slides in, traps focus, and closes on Escape", async ({ page }, info) => {
  test.skip(info.project.name !== "phone-dark", "phone only");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Open menu" }).click();
  const dialog = page.getByRole("dialog", { name: "Menu" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: `test/screens/chat-menu-open-${info.project.name}.png` });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
});

for (const path of ["/", "/approvals", "/admin/deadlines"]) {
  test(`Screenshot with the menu: ${path}`, async ({ page }, info) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test/screens/chat-menu${path.replace(/\//g, "-") || "-home"}-${info.project.name}.png` });
    expect(await serious(page)).toEqual([]);
  });
}
