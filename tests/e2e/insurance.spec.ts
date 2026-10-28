import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick, typeDate } from "../helpers/controls";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Insurance tab: three sample payers, the prepared CMS-855I, and what she completes", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/paperwork?tab=insurance");
  await expect(page.getByRole("link", { name: "Insurance" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("listitem", { name: "BCBSIL" }).getByText("Applied", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Aetna" }).getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText(/writes in Mental Health Counselor \(MHC\)/)).toBeVisible();
  await expect(page.getByText(/Section 15: the certification statement and your signature/)).toBeVisible();

  const pdf = await request.get("/api/payers/cms855i");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("Marking BCBSIL approved sets a recredential date 36 months out", async ({ page }) => {
  await page.goto("/paperwork?tab=insurance");
  await page.waitForLoadState("networkidle");
  const bcbs = page.getByRole("listitem", { name: "BCBSIL" });
  await bcbs.getByRole("button", { name: "Edit BCBSIL" }).click();
  await pick(page, bcbs, "Status", "Approved");
  await typeDate(bcbs, "Approved", "2026-10-27");
  await typeDate(bcbs, "Follow up", "");
  await bcbs.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem", { name: "BCBSIL" }).getByText(/Recredential by Oct 27, 2029/)).toBeVisible();
});

test("Deadlines shows the BCBSIL follow-up", async ({ page }) => {
  await page.goto("/deadlines");
  const card = page.getByRole("region", { name: "Insurance follow-ups" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Insurance follow-ups" }) }));
  await expect(card.getByText(/Follow up with BCBSIL/)).toBeVisible();
});

test("Insurance tab has no serious accessibility problems", async ({ page }) => {
  await page.goto("/paperwork?tab=insurance");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Edit BCBSIL" }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("Screenshot of the Insurance tab", async ({ page }, info) => {
  await page.goto("/paperwork?tab=insurance");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `test/screens/insurance-${info.project.name}.png`, fullPage: true });
});
