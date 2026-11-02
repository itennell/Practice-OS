import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// The Files page (/files): everything she added and everything Aeon made, in one list
// from the document index (lib/documents/files.ts). Filter chips, search, the Open
// side panel and accessibility, on the seeded fictional demo practice.

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Files lists everything in one place, filters, searches and opens a file", async ({ page }) => {
  await page.goto("/files");
  await expect(page.getByRole("heading", { level: 1, name: "Files" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) >= 768) {
    // In the menu between Admin and Approvals.
    const nav = page.getByRole("navigation", { name: "Main" });
    const names = (await nav.getByRole("link").allInnerTexts()).map((t) => t.split("\n")[0].trim());
    expect(names.indexOf("Files")).toBe(names.findIndex((n) => n.startsWith("Admin")) + 1);
    await expect(nav.getByRole("link", { name: "Files" })).toHaveAttribute("aria-current", "page");
  }

  const forms = page.getByRole("region", { name: /^Forms/ });
  const money = page.getByRole("region", { name: /^Estimates & superbills/ });
  await expect(forms).toBeVisible();
  await expect(money).toBeVisible();
  // A Good Faith Estimate is its reference number, never a client's name.
  await expect(money.getByText(/^GFE-\d{4}-\d{4}: /).first()).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  // Filter: only estimates and superbills.
  const show = page.getByRole("group", { name: "Show" });
  await show.getByRole("button", { name: /^Estimates & superbills/ }).click();
  await expect(show.getByRole("button", { name: /^Estimates & superbills/ })).toHaveAttribute("aria-pressed", "true");
  await expect(forms).toHaveCount(0);
  await expect(money).toBeVisible();
  for (const button of await show.getByRole("button").all()) expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  // Uploaded: her files, or (none yet) how to add the first one. The reset keeps files she added.
  const uploaded = show.getByRole("button", { name: /^Uploaded/ });
  await uploaded.click();
  if ((await uploaded.locator("span").innerText()).trim() === "0") {
    await expect(page.getByText("Nothing uploaded yet")).toBeVisible();
    await expect(page.getByText(/with the \+ in the chat box/)).toBeVisible();
  } else {
    await expect(page.getByRole("region", { name: /^Uploaded/ })).toBeVisible();
  }

  // Search across everything.
  await show.getByRole("button", { name: /^All/ }).click();
  await page.getByRole("searchbox", { name: "Search files" }).fill("superbill");
  await expect(forms).toHaveCount(0);
  await expect(money).toBeVisible();
  await page.getByRole("searchbox", { name: "Search files" }).fill("zzzz nothing");
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search files" }).fill("");

  // Open shows the side panel with the file's card; closing comes back to Files.
  const open = money.getByRole("link", { name: /^Open / }).first();
  expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await open.click();
  const panel = page.getByRole("dialog");
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/Made by Aeon/)).toBeVisible();
  await expect(panel.getByRole("list", { name: /^Document/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/files$/);
  await expect(panel).toHaveCount(0);
});
