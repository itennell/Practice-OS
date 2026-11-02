import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick, typeDate } from "../helpers/controls";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Insurance panel: three sample payers, the prepared CMS-855I, and what she completes", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin?panel=insurance");
  await expect(page.getByRole("dialog", { name: "Insurance" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "BCBSIL", exact: true }).getByText("Applied", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Aetna", exact: true }).getByText("Approved", { exact: true })).toBeVisible();
  await expect(page.getByText(/writes in Mental Health Counselor \(MHC\)/)).toBeVisible();
  await expect(page.getByText(/Section 15: the certification statement and your signature/)).toBeVisible();
  // Only her own change marks an application sent: the panel says so, and the old wording is gone.
  await expect(page.getByText(/only your own change records the sent date/)).toBeVisible();
  await expect(page.getByText(/Telling Aeon in chat never marks it sent/)).toBeVisible();
  await expect(page.getByText(/I sent my/)).toHaveCount(0);

  const pdf = await request.get("/api/payers/cms855i");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("Marking BCBSIL approved sets a recredential date 36 months out", async ({ page }) => {
  await page.goto("/admin?panel=insurance");
  await page.waitForLoadState("networkidle");
  const bcbs = page.getByRole("listitem", { name: "BCBSIL", exact: true });
  await bcbs.getByRole("button", { name: "Edit BCBSIL" }).click();
  await pick(page, bcbs, "Status", "Approved");
  await typeDate(bcbs, "Approved", "2026-10-27");
  await typeDate(bcbs, "Follow up", "");
  await bcbs.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem", { name: "BCBSIL", exact: true }).getByText(/Recredential by Oct 27, 2029/)).toBeVisible();
});

test("Checklist: every insurer for the demo LCPC is already listed, and checking steps moves the status", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin?panel=insurance");
  const insurers = page.getByRole("region", { name: "Insurers that take a LCPC in IL" });
  const rows = insurers.getByRole("listitem").filter({ has: page.locator("details") });
  await expect(rows.nth(0)).toHaveAccessibleName(/^Medicare/);
  await expect(rows.nth(1)).toHaveAccessibleName(/^Aetna \(commercial/);
  await expect(rows.nth(2)).toHaveAccessibleName(/^Blue Cross and Blue Shield of Illinois/);
  for (const name of [/^Cigna/, /^UnitedHealthcare/, /^Illinois Medicaid/, /^TRICARE/]) await expect(insurers.getByRole("listitem", { name })).toBeVisible();
  await expect(page.getByRole("region", { name: "Or join through a platform" }).getByRole("listitem", { name: "Headway" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Before any payer" })).toBeVisible();

  // Medicare: an LCPC enrolls as a Mental Health Counselor; TRICARE shows the counselor standards step.
  const medicare = insurers.getByRole("listitem", { name: /^Medicare/ });
  await medicare.locator("summary").click();
  await expect(medicare.getByText(/Mental Health Counselor/).first()).toBeVisible();
  await expect(medicare.getByText("You send this yourself. Aeon prepares, never signs or submits.")).toBeVisible();

  const cigna = insurers.getByRole("listitem", { name: /Cigna/ });
  await expect(cigna.getByText("Not started", { exact: true })).toBeVisible();
  await cigna.locator("summary").click();
  await cigna.getByRole("checkbox").first().click();
  await expect(cigna.getByText("Preparing", { exact: true })).toBeVisible();
  // The step where she submits moves it to Applied, with a 30-day follow-up.
  await cigna.getByRole("checkbox", { name: "Submit the Provider Information Form" }).click();
  await expect(cigna.getByText("Applied", { exact: true })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Cigna / Evernorth Behavioral Health", exact: true }).getByText(/Follow up/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Chat: walking through Cigna in a chat checks off the same step", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts walk-cigna", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto(`/?c=${id}`);
  await expect(page.getByText(/Step 1 of 8 for Cigna/)).toBeVisible();
  await expect(page.getByText(/Next is Step 2/)).toBeVisible();
  await page.goto("/admin?panel=insurance");
  const cigna = page.getByRole("region", { name: "Insurers that take a LCPC in IL" }).getByRole("listitem", { name: /Cigna/ });
  await expect(cigna.getByText("Preparing", { exact: true })).toBeVisible();
  await expect(cigna.getByText(/1 of 8 steps · Next: /)).toBeVisible();
});

test("Deadlines shows the BCBSIL follow-up", async ({ page }) => {
  await page.goto("/admin/deadlines");
  const card = page.getByRole("region", { name: "Insurance follow-ups" }).or(page.locator("section", { has: page.getByRole("heading", { name: "Insurance follow-ups" }) }));
  await expect(card.getByText(/Follow up with BCBSIL/)).toBeVisible();
});

test("Insurance panel has no serious accessibility problems", async ({ page }) => {
  await page.goto("/admin?panel=insurance");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Edit BCBSIL" }).click();
  await page.getByRole("listitem", { name: /^Medicare/ }).locator("summary").click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("Screenshot of the Insurance panel", async ({ page }, info) => {
  await page.goto("/admin?panel=insurance");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `test/screens/insurance-${info.project.name}.png`, fullPage: true });
});
