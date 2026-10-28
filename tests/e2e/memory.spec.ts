import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Add, refuse, edit, switch off and delete a memory", async ({ page }) => {
  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "What Aeon remembers" })).toBeVisible();
  await expect(page.getByText(/hasn't saved anything yet/)).toBeVisible();

  const what = page.getByLabel("What to remember");
  await what.fill("Ms. Alvarez prefers Tuesday sessions");
  await page.getByRole("button", { name: "Remember this" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "person's name" })).toBeVisible();
  await expect(page.getByRole("list").getByText("Alvarez")).toHaveCount(0);

  await page.getByLabel("Kind").selectOption("decision");
  await what.fill("[Sample] Does not take Medicaid");
  await page.getByRole("button", { name: "Remember this" }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Does not take Medicaid" });
  await expect(item).toContainText("Decision · added by you");

  await item.getByRole("button", { name: "Edit" }).click();
  await item.getByLabel("Edit memory").fill("[Sample] Does not take Medicaid or Medicare");
  await item.getByRole("button", { name: "Save" }).click();
  const edited = page.getByRole("listitem").filter({ hasText: "or Medicare" });
  await expect(edited).toBeVisible();

  await edited.getByRole("button", { name: "Stop using" }).click();
  await expect(edited).toContainText("switched off");
  await expect(edited.getByRole("button", { name: "Use again" })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await edited.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete memory" }).click();
  // While the dialog is open the page behind it is hidden from the test, so wait for it to close first.
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: "or Medicare" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(/hasn't saved anything yet/)).toBeVisible();
});
