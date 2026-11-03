import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { closePanel, openPartner, partnerRow } from "../helpers/partners";

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Referrals CRM: header, numbers, tabs in the URL, the partners table, and More › Move stage", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  await expect(page.getByRole("heading", { level: 1, name: "Referrals" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Find partners" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add partner" })).toBeVisible();
  const numbers = page.getByRole("region", { name: "Referral numbers" });
  for (const t of ["Partners", "Reach out this week", "Waiting on you", "Referrals this month"]) await expect(numbers.getByText(t, { exact: true })).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Referrals views" });
  await expect(tabs.getByRole("tab")).toHaveText(["Partners", "Overview", "Board", "Calendar", "Map", "Meetings and notes"]);
  await expect(tabs.getByRole("tab", { name: "Partners" })).toHaveAttribute("aria-selected", "true");
  // Keyboard: arrow to Overview, and the tab goes into the address bar.
  await tabs.getByRole("tab", { name: "Partners" }).focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(tabs.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=overview$/);
  await page.goto("/referrals?tab=board");
  await expect(page.getByRole("tab", { name: "Board" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Partners" }).click();

  // The table on a wide screen; stacked rows on a phone.
  if ((page.viewportSize()?.width ?? 1280) >= 768) {
    const table = page.getByRole("table", { name: "Partners" });
    await expect(table.getByRole("columnheader")).toHaveText(["", "Name and practice", "Kind", "Email", "Phone", "Stage", "Last contact", "Quick actions"]);
  } else {
    await expect(page.getByRole("list", { name: "Partners" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  const row = partnerRow(page, "[Sample] Juniper Row Family Medicine");
  await expect(row).toContainText("0.6 mi");
  await expect(row).toContainText("Primary care");
  await expect(row).toContainText("Found");

  // Keyboard and screen-reader way: More › Move stage.
  await row.getByRole("button", { name: "More for [Sample] Juniper Row Family Medicine" }).click();
  await page.getByRole("menuitem", { name: "Move stage" }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/stage") && r.request().method() === "POST");
  await page.getByRole("menuitemradio", { name: /^Met/ }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Moved [Sample] Juniper Row Family Medicine to Met." })).toBeAttached();
  await expect(row).toContainText("Met");
  await page.reload();
  await expect(partnerRow(page, "[Sample] Juniper Row Family Medicine")).toContainText("Met");
  expect(errors).toEqual([]);
});

test("filters: Kind, Email and Show not a fit; the panel opens from a row", async ({ page }) => {
  await page.goto("/referrals");
  await page.getByRole("button", { name: "Email", exact: true }).click();
  await page.getByRole("menuitemradio", { name: "Missing email" }).click();
  await expect(page.getByRole("button", { name: "Email: Missing email" })).toBeVisible();
  await expect(partnerRow(page, "[Sample] Juniper Row Family Medicine")).toHaveCount(0);
  await page.getByRole("button", { name: "Email: Missing email" }).click();
  await page.getByRole("menuitemradio", { name: "Any" }).click();
  await expect(partnerRow(page, "[Sample] Juniper Row Family Medicine")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Show not a fit" })).toHaveAttribute("aria-pressed", "false");

  const panel = await openPartner(page, "[Sample] Juniper Row Family Medicine");
  await expect(panel).toContainText("Next step");
  await expect(panel).toContainText("Contact history");
  await closePanel(page);
});

test("call script: three versions, plain words, nothing of value offered", async ({ page }) => {
  await page.goto("/referrals");
  await partnerRow(page, "[Sample] Juniper Row Family Medicine").getByRole("button", { name: "Call script for [Sample] Juniper Row Family Medicine" }).click();
  const sheet = page.getByRole("dialog", { name: "Call script: [Sample] Juniper Row Family Medicine" });
  await expect(sheet.getByRole("tab")).toHaveText(["Front desk", "Provider", "Voicemail"]);
  await expect(sheet).toContainText("How do you usually refer for counseling?");
  await expect(sheet).toContainText("Who handles referrals:");
  await sheet.getByRole("tab", { name: "Voicemail" }).click();
  await expect(sheet).toContainText("You can reach me at");
  for (const tab of ["Front desk", "Provider", "Voicemail"]) {
    await sheet.getByRole("tab", { name: tab }).click();
    await expect(sheet.getByRole("tabpanel", { name: tab })).not.toContainText(/\b(?:gifts?|lunch|treats?|in return|free|for each)\b/i);
  }
  const results = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("Referrals page passes axe", async ({ page }) => {
  await page.goto("/referrals");
  await expect(page.getByRole("button", { name: "Open [Sample] Juniper Row Family Medicine", exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("Referrals changes only come from the app's own page, as JSON", async ({ request, baseURL }) => {
  const board = await request.get("/api/menu");
  expect(board.ok()).toBe(true);
  const id = "00000000-0000-4000-8000-000000000203"; // [Sample] Thistlewood OB-GYN
  const own = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL! }, data: { stage: "connected" } });
  expect(own.status()).toBe(200);
  expect((await own.json()).card.stage).toBe("connected");

  const otherSite = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: "https://evil.example" }, data: { stage: "not_a_fit" } });
  expect(otherSite.status()).toBe(403);
  const form = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL!, "content-type": "text/plain" }, data: '{"stage":"not_a_fit"}' });
  expect(form.status()).toBe(403);
  const back = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL! }, data: { stage: "follow_up" } });
  expect(back.status()).toBe(200);
});
