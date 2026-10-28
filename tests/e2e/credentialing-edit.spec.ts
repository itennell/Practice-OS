import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { typeDate } from "../helpers/controls";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Renewing malpractice in the profile clears it from CAQH prep and survives a reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin?panel=credentialing");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Upload your renewed malpractice face sheet")).toBeVisible();

  const malpractice = page.getByRole("listitem", { name: "Malpractice" });
  await malpractice.getByRole("button", { name: "Edit Malpractice" }).click();
  await typeDate(malpractice, "Expires", "2027-12-01");
  await malpractice.getByRole("button", { name: "Save" }).click();
  await expect(malpractice.getByText("2027-12-01")).toBeVisible();

  const documents = page.getByRole("listitem", { name: "Documents" });
  await documents.getByRole("button", { name: "Edit Documents" }).click();
  await typeDate(documents, "Expires (blank if never)", "2027-12-01", { nth: 1 });
  await documents.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Upload your renewed malpractice face sheet")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("listitem", { name: "Malpractice" }).getByText("2027-12-01")).toBeVisible();
  await expect(page.getByText("You must log in and click Attest yourself.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("A bad NPI is refused with a plain message", async ({ page }) => {
  await page.goto("/admin?panel=credentialing");
  await page.waitForLoadState("networkidle");
  const npi = page.getByRole("listitem", { name: "NPI" });
  await npi.getByRole("button", { name: "Edit NPI" }).click();
  await npi.getByLabel("NPI (10 digits)").fill("1999999902");
  await npi.getByRole("button", { name: "Save" }).click();
  await expect(npi.getByRole("alert")).toContainText("Not a valid NPI");
});

test("The license section has no number field", async ({ page }) => {
  await page.goto("/admin?panel=credentialing");
  await page.waitForLoadState("networkidle");
  const license = page.getByRole("listitem", { name: "License" });
  await license.getByRole("button", { name: "Edit License" }).click();
  await expect(license.getByRole("textbox")).toHaveCount(3);
  await expect(license.getByLabel(/number/i)).toHaveCount(0);
});

test("Credentialing edit form has no serious accessibility problems", async ({ page }) => {
  await page.goto("/admin?panel=credentialing");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Edit Work history" }).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("Screenshot of the editable profile", async ({ page }, info) => {
  await page.goto("/admin?panel=credentialing");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Edit Malpractice" }).click();
  await page.screenshot({ path: `test/screens/credentialing-edit-${info.project.name}.png`, fullPage: true });
});
