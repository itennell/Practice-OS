import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Manual, Auto and Bypass: the pill under the chat box, the ask bar above it,
// and the defaults in Settings. No model call is needed for any of this.

// db:reset never touches settings, so each test puts the defaults back itself.
test.beforeEach(async ({ request }) => {
  execSync("npm run db:reset", { stdio: "ignore" });
  expect((await request.put("/api/settings/approval-mode", { data: { mode: "auto" } })).ok()).toBe(true);
  expect((await request.put("/api/settings/front-desk", { data: { text_missed_callers: true } })).ok()).toBe(true);
});

test.afterAll(async ({ request }) => {
  await request.put("/api/settings/approval-mode", { data: { mode: "auto" } });
  await request.put("/api/settings/front-desk", { data: { text_missed_callers: true } });
});

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("The mode pill under the chat box: Auto by default, a box of choices, Shift+Tab, and Bypass asks first", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const pill = page.getByRole("button", { name: /^Mode: / });
  await expect(pill).toHaveAccessibleName(/Mode: Auto/);

  await pill.click();
  for (const name of ["Manual", "Auto", "Bypass"]) await expect(page.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: /^Manual/ }).click();
  await expect(pill).toHaveAccessibleName(/Mode: Manual/);

  await page.getByRole("textbox", { name: "Message Aeon" }).press("Shift+Tab");
  await expect(pill).toHaveAccessibleName(/Mode: Auto/);

  await pill.click();
  await page.getByRole("button", { name: /^Bypass/ }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("still wait for you");
  await dialog.getByRole("button", { name: "Switch to Bypass" }).click();
  await expect(pill).toHaveAccessibleName(/Mode: Bypass/);
});

test("The ask bar: Aeon needs your approval, Approve or Not now", async ({ page }) => {
  await page.goto("/");
  const bar = page.getByRole("region", { name: "Waiting for your approval" });
  await expect(bar).toContainText("Aeon needs your approval. Can Aeon get this done for you?");
  const first = await bar.locator("p").nth(1).innerText();
  await bar.getByRole("button", { name: "Not now" }).click();
  await expect(bar.locator("p").nth(1)).not.toHaveText(first);
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: `test/screens/modes-chat-${test.info().project.name}.png`, fullPage: true });
});

test("The ask bar fits the chat column beside the sidebar: its words never squeeze into one column", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");
  const bar = page.getByRole("region", { name: "Waiting for your approval" });
  const question = bar.getByText("Aeon needs your approval. Can Aeon get this done for you?");
  await expect(question).toBeVisible();
  const box = (await question.boundingBox())!;
  const column = (await bar.boundingBox())!;
  // The question spans most of the bar (buttons go below it), at most two lines.
  expect(box.width).toBeGreaterThan(column.width * 0.6);
  expect(box.height).toBeLessThan(60);
  await page.screenshot({ path: `test/screens/modes-chat-narrow-${test.info().project.name}.png`, fullPage: true });
});

test("Settings: default mode and Front Desk's own rule", async ({ page }) => {
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "How Aeon works in chat" })).toBeVisible();
  const group = page.getByRole("radiogroup", { name: "Default mode for new chats" });
  await expect(group.getByRole("radio", { name: /Auto/ })).toBeChecked();
  await group.getByRole("radio", { name: /Manual/ }).click();
  await expect(page.getByText("New chats start in Manual.")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("radiogroup", { name: "Default mode for new chats" }).getByRole("radio", { name: /Manual/ })).toBeChecked();
  await page.goto("/");
  await expect(page.getByRole("button", { name: /^Mode: / })).toHaveAccessibleName(/Mode: Manual/);

  await page.goto("/settings");
  const sw = page.getByRole("switch", { name: "Text callers I miss" });
  await expect(sw).toBeChecked();
  await sw.click();
  await expect(sw).not.toBeChecked();
  expect(await seriousViolations(page)).toEqual([]);
  await page.screenshot({ path: `test/screens/modes-settings-${test.info().project.name}.png`, fullPage: true });
});
