import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { closePanel, openPartner, partnerRow } from "../helpers/partners";

// Referrals v2 in the partner panel: who confirmed it and where its email came from,
// the contact log moves the partner and its tier, Log referral keeps a date only, and
// a live search adds a partner whose NPI Registry evidence shows at once (internet).

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(180_000);

test("a partner's panel shows Confirmed by and its email with where it came from", async ({ page }) => {
  await page.goto("/referrals");
  await expect(partnerRow(page, "[Sample] Juniper Row Family Medicine")).toContainText("frontdesk@example.com");
  const card = await openPartner(page, "[Sample] Juniper Row Family Medicine");
  const ev = card.getByTestId("evidence");
  await expect(ev).toContainText("Confirmed");
  await expect(ev).toContainText("Confirmed by: OpenStreetMap · Their website");
  await expect(ev).toContainText("frontdesk@example.com");
  await expect(ev).toContainText("(on their contact page)");
  await ev.getByText("What each source says").click();
  await expect(ev).toContainText("Their robots.txt: robots.txt allows /contact");
});

test("logging a call moves the partner; their reply moves it to Met", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  const name = "[Sample] Thistlewood OB-GYN";
  await expect(partnerRow(page, name)).toContainText("Reached out");
  const card = await openPartner(page, name);
  await expect(card).toContainText("Warm up next");

  await card.getByText(/^Log a call, email or meeting/).click();
  // "Called" is picked already.
  await card.getByRole("textbox", { name: "Note (optional, no client details)" }).fill("Spoke with the office manager.");
  const saved = page.waitForResponse((r) => r.url().endsWith("/contacts") && r.request().method() === "POST");
  await card.getByRole("button", { name: "Log it" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: `Logged "Called" for ${name}.` })).toBeAttached();
  await expect(card).toContainText("Spoke with the office manager.");
  await expect(card).toContainText("Reached out");

  // They replied: the card moves to Met, and "Reach out first" (advice for someone she hasn't met) no longer shows.
  await card.getByRole("combobox", { name: "What happened" }).click();
  await page.getByRole("option", { name: "They replied" }).click();
  await card.getByRole("button", { name: "Log it" }).click();
  await expect(card).toContainText("Met");
  await expect(card).not.toContainText("Reach out first");
  await expect(card).toContainText("They answered your letter");
  await closePanel(page);
  await expect(partnerRow(page, name)).toContainText("Met");

  await page.reload();
  await expect(partnerRow(page, name)).toContainText("Met");
  await expect(await openPartner(page, name)).toContainText("They answered your letter");
  expect(errors).toEqual([]);
});

test("they referred someone: only a count, and the confidentiality rule is shown", async ({ page }) => {
  await page.goto("/referrals");
  const card = await openPartner(page, "[Sample] Fernhollow Pediatrics");
  await card.getByText(/^Log a call, email or meeting/).click();
  await expect(card).toContainText("Referred someone to you 1 time.");
  await expect(card).toContainText("never tells the referrer that someone became your client");
  await expect(card).toContainText("Introduced by [Sample] my old supervisor");
});

test("Log referral on a row keeps only the date, and the number goes up", async ({ page }) => {
  await page.goto("/referrals");
  const numbers = page.getByRole("region", { name: "Referral numbers" });
  const before = Number((await numbers.locator("p.text-title").nth(3).textContent()) ?? "0");
  const saved = page.waitForResponse((r) => r.url().endsWith("/contacts") && r.request().method() === "POST");
  await partnerRow(page, "[Sample] Fernhollow Pediatrics").getByRole("button", { name: "Log a referral from [Sample] Fernhollow Pediatrics" }).click();
  const post = await saved;
  expect(post.ok()).toBe(true);
  expect(Object.keys(post.request().postDataJSON() as object).sort()).toEqual(["happened_on", "kind"]);
  await expect(numbers.locator("p.text-title").nth(3)).toHaveText(String(before + 1));
});

test("Referrals v2 panel passes axe with the log and sources open", async ({ page }) => {
  await page.goto("/referrals");
  const card = await openPartner(page, "[Sample] Juniper Row Family Medicine");
  await card.getByText("What each source says").click();
  await card.getByText(/^Log a call, email or meeting/).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(" ")})`)).toEqual([]);
});

test("live: Find partners, add to the board, and the partner shows the NPI Registry as a source", async ({ page }) => {
  await page.goto("/referrals");
  await page.getByRole("button", { name: "Find partners" }).click();
  const sheet = page.getByRole("dialog", { name: "Find partners" });
  await expect(sheet.getByText(/^\d+ in 60614/)).toBeVisible({ timeout: 120_000 });
  const add = sheet.getByRole("region", { name: "Referral sources by tier" }).getByRole("button", { name: /^Add to board: / }).first();
  const name = (await add.getAttribute("aria-label"))!.replace("Add to board: ", "");
  await add.click();
  await expect(sheet.locator(":focus")).toHaveText("On your board: Found", { timeout: 30_000 });
  await closePanel(page);
  const card = await openPartner(page, name);
  await expect(card.getByTestId("evidence")).toContainText("Confirmed by: NPI Registry", { timeout: 30_000 });
});
