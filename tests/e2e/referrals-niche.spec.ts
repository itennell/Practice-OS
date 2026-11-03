import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { closePanel, openPartner } from "../helpers/partners";
import { REFERRALS_ONLY_DEMO } from "../../lib/features";
import { pick } from "../helpers/controls";

// Her niche at phone width (390px), on the fictional demo practice: the onboarding
// niche screen pre-selects that niche's kinds, Settings › Referrals saves a niche,
// and the Partners Kind filter shows one kind at a time. axe-clean, nothing
// wider than the phone. No model call, no internet.

test.use({ viewport: { width: 390, height: 844 } });

// db:reset gives Dana her demo niche and its kinds every time (lib/demo-reset.ts), so each test
// starts there, and afterAll leaves both niche and kinds as the demo has them.
test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});
test.afterAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(120_000);

async function axeClean(page: Page) {
  // Let chip colour transitions settle so axe reads the final colours.
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test("onboarding: picking a niche pre-selects its kinds on the next screen", async ({ page }) => {
  test.skip(!REFERRALS_ONLY_DEMO, "The niche screen is on the referrals-only short path (lib/features.ts).");
  await page.goto("/onboarding?q=referrals:niche");
  const heading = page.getByRole("heading", { level: 1 });
  await expect(heading).toHaveText(/closest to your niche/);
  // Dana's seeded niche is already picked.
  await expect(page.getByRole("radio", { name: /Oncology \/ serious illness/ })).toBeChecked();
  await page.getByRole("radio", { name: /Grief and loss/ }).click();
  await axeClean(page);
  await page.getByRole("button", { name: /^(Next|Finish setup)$/ }).click();
  await expect(heading).toHaveText(/Who would you like to hear from/, { timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Hospice", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Pediatrics", exact: true })).toHaveAttribute("aria-pressed", "false");
  await axeClean(page);
});

test("Settings › Referrals: the niche picker saves", async ({ page }) => {
  await page.goto("/settings");
  const card = page.getByRole("region", { name: "Referrals", exact: true });
  await expect(card.getByRole("combobox", { name: "Your niche" })).toContainText("Oncology / serious illness / end of life");
  await pick(page, card, "Your niche", "Grief and loss");
  // Her search kinds stay unless she turns this on (off by default in Settings).
  const switchKinds = card.getByRole("switch", { name: /Also switch your search kinds/ });
  await expect(switchKinds).not.toBeChecked();
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/settings/referrals") && r.request().method() === "PUT");
  await card.getByRole("button", { name: "Save niche" }).click();
  const put = await saved;
  expect(put.ok()).toBe(true);
  expect(put.request().postDataJSON()).toEqual({ nichePreset: "grief_loss" });
  await expect(card).toContainText("Saved. Your map and board rank by it now.");
  await axeClean(page);
  await page.reload();
  const again = page.getByRole("region", { name: "Referrals", exact: true });
  await expect(again.getByRole("combobox", { name: "Your niche" })).toContainText("Grief and loss");
  // Turned on, the niche's kinds go with it.
  await pick(page, again, "Your niche", "Oncology / serious illness / end of life");
  await again.getByRole("switch", { name: /Also switch your search kinds/ }).click();
  const second = page.waitForResponse((r) => r.url().endsWith("/api/settings/referrals") && r.request().method() === "PUT");
  await again.getByRole("button", { name: "Save niche" }).click();
  const body = (await second).request().postDataJSON() as { nichePreset: string; specialties: string[] };
  expect(body.nichePreset).toBe("oncology_serious_illness");
  expect(body.specialties).toContain("oncology");
});

test("partners: the Kind filter shows one kind at a time, and the panel names the niche", async ({ page }) => {
  // The map searches the live NPI Registry; the partners are what this checks.
  await page.route("**/api/referrals/area", (route) => route.fulfill({ status: 503, json: { error: "[Sample] offline in this test" } }));
  await page.goto("/referrals");
  const oncology = page.getByRole("listitem", { name: "[Sample] Quillmere Oncology Group", exact: true });
  const juniper = page.getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine", exact: true });
  await expect(juniper).toBeVisible();
  await page.getByRole("button", { name: "Kind", exact: true }).click();
  await page.getByRole("menuitemcheckbox", { name: /^Medical specialists/ }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Kind: Medical specialists" })).toBeVisible();
  await expect(oncology).toBeVisible();
  await expect(juniper).toHaveCount(0);
  await axeClean(page);
  const panel = await openPartner(page, "[Sample] Quillmere Oncology Group");
  await expect(panel).toContainText("Fits your oncology & end-of-life focus (Medical specialists)");
  await closePanel(page);
  await page.getByRole("button", { name: "Kind: Medical specialists" }).click();
  await page.getByRole("menuitem", { name: "Clear" }).click();
  await expect(juniper).toBeVisible();
});
