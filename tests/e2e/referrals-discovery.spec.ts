import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// "Add someone yourself" at phone width (390px): add a cancer nonprofit by
// hand and see it under Found labelled "Added by you"; then preview a CSV
// where one row matches a card already on the board and one is new, and add
// the new one. A sensitive kind hides the street and ZIP fields. Axe-clean,
// nothing wider than the phone. Saves to the built-in database only.

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(120_000);

const CSV = [
  "name,type,city,phone",
  "[Sample] Lakeview Family Medicine,family_medicine,Chicago,",
  "[Sample] Riverside Grief Center,grief_centers,Chicago,312-555-0150",
  "[Sample] No Kind,,Chicago,",
].join("\n");

test("add a referral source by hand, then preview and import a CSV", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  const box = page.getByTestId("add-yourself");
  await box.scrollIntoViewIfNeeded();

  const form = box.getByRole("form", { name: "Add a referral source yourself" });
  await form.getByRole("textbox", { name: "Organization name" }).fill("[Sample] Gilda's Club Chicago");
  // A sensitive kind keeps only the city: the street and ZIP fields go away.
  await form.getByRole("combobox", { name: "Kind of referral source" }).click();
  await page.getByRole("option", { name: /^Domestic violence and sexual assault agencies/ }).click();
  await expect(form.getByRole("textbox", { name: "Street address" })).toHaveCount(0);
  await expect(form).toContainText("Contact through their public line only.");
  await form.getByRole("combobox", { name: "Kind of referral source" }).click();
  await page.getByRole("option", { name: /^Disease organizations/ }).click();
  await expect(form.getByRole("textbox", { name: "Street address" })).toBeVisible();
  await form.getByRole("textbox", { name: "Phone" }).fill("312-555-0100");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const axe = await new AxeBuilder({ page }).include('[data-testid="add-yourself"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/referrals/manual"));
  await form.getByRole("button", { name: "Add to board" }).click();
  expect((await saved).ok()).toBe(true);
  const card = page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Gilda's Club Chicago" });
  await expect(card).toContainText("Added by you");
  await expect(card).toContainText("312-555-0100");

  // From a spreadsheet: the preview says what would happen, row by row.
  await box.getByRole("button", { name: "From a spreadsheet" }).click();
  await expect(box.getByRole("link", { name: "Download the template" })).toHaveAttribute("href", "/api/referrals/import/template");
  await box.getByLabel("CSV file to import").setInputFiles({ name: "contacts.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  const preview = box.getByRole("region", { name: "Import preview" });
  await expect(preview).toContainText("1 new, 1 matched existing cards, 1 with a problem");
  await expect(preview).toContainText("Matched existing card: [Sample] Lakeview Family Medicine");
  await expect(preview).toContainText("Pick what kind of referral source this is.");

  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const axe2 = await new AxeBuilder({ page }).include('[data-testid="add-yourself"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe2.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  const imported = page.waitForResponse((r) => r.url().endsWith("/api/referrals/import"));
  await preview.getByRole("button", { name: "Add 1 new" }).click();
  expect((await imported).ok()).toBe(true);
  await expect(page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Riverside Grief Center" })).toContainText("Added by you");
  await expect(page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" })).toHaveCount(1);
  expect(errors).toEqual([]);
});
