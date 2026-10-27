import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Deadlines shows Dana's urgent items with what to do and the source", async ({ page }) => {
  await page.goto("/deadlines");
  const caqh = page.getByRole("listitem", { name: "CAQH re-attestation (Illinois: every 180 days)" });
  await expect(caqh.getByText("9 days")).toBeVisible();
  await expect(caqh.getByText("You do this:")).toBeVisible();
  await expect(caqh.getByRole("link", { name: "CAQH Provider User Guide, 8.3" })).toHaveAttribute("href", /caqh\.org/);
  await expect(page.getByRole("listitem", { name: "PLLC annual report (Secretary of State)" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "CE hours done" })).toHaveAttribute("aria-valuenow", "18");
  // No employer rules for a solo practice.
  await expect(page.getByText("Payroll return (Form 941)")).toHaveCount(0);
});

test("A setup answer is saved and the reminder comes back later, not now", async ({ page }) => {
  await page.goto("/deadlines");
  const group = page.getByRole("group", { name: "Answer: Retirement plan" });
  await group.getByRole("button", { name: "Not yet" }).click();
  await expect(page.getByRole("heading", { name: "Retirement plan" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Professional will" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Retirement plan" })).toHaveCount(0);
});

test("Screenshot of Deadlines", async ({ page }, info) => {
  await page.goto("/deadlines");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `test/screens/deadlines-${info.project.name}.png`, fullPage: true });
});
