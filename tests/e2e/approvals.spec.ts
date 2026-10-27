import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Approve a test note: Waiting for you, then Done", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await expect(card.getByText("Waiting for you")).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Done")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Done");
});

test("The failing note ends as Failed with its error", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  const after = page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" });
  await expect(after.getByText("Failed", { exact: true })).toBeVisible();
  await expect(after.getByText("Test failure requested (payload.fail is true).")).toBeVisible();
});

test("Edit then approve runs the edited text", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await card.getByRole("button", { name: "Edit then approve" }).click();
  await card.getByRole("textbox").fill("[Sample] Edited by Dana before approving.");
  await card.getByRole("button", { name: "Approve edited version" }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Done")).toBeVisible();
});

test("Decline marks it Declined", async ({ page }) => {
  await page.goto("/dashboard");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await card.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Declined")).toBeVisible();
});

for (const path of ["/", "/approvals", "/deadlines", "/settings"]) {
  test(`No serious accessibility issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Screenshots of Home and the failed state", async ({ page }, info) => {
  await page.goto("/dashboard");
  await page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await page.screenshot({ path: `test/screens/home-${info.project.name}.png`, fullPage: true });
});
