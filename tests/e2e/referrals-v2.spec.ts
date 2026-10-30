import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// Referrals v2: each card says who confirmed it and where its email came from,
// the contact log moves the card and its tier, and a live search adds a card
// whose NPI Registry evidence shows at once (that one needs the internet).

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(180_000);

test("a card shows Confirmed by and its email with where it came from", async ({ page }) => {
  await page.goto("/referrals");
  const card = page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" });
  const ev = card.getByTestId("evidence");
  await expect(ev).toContainText("Confirmed");
  await expect(ev).toContainText("Confirmed by: OpenStreetMap · Their website");
  await expect(ev).toContainText("frontdesk@example.com");
  await expect(ev).toContainText("(on their contact page)");
  await ev.getByText("What each source says").click();
  await expect(ev).toContainText("Their robots.txt: robots.txt allows /contact");
});

test("logging a call moves the card; their reply moves it to Connected and up a tier", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  const name = "[Sample] Old Town OB-GYN";
  let card = page.getByRole("region", { name: "Follow up" }).getByRole("listitem", { name });
  await expect(card).toContainText("Warm up next");

  await card.getByText(/^Log a call, email or meeting/).click();
  // "Called" is picked already.
  await card.getByRole("textbox", { name: "Note (optional, no client details)" }).fill("Spoke with the office manager.");
  const saved = page.waitForResponse((r) => r.url().endsWith("/contacts") && r.request().method() === "POST");
  await card.getByRole("button", { name: "Log it" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: `Logged "Called" for ${name}.` })).toBeAttached();
  card = page.getByRole("region", { name: "Contacted" }).getByRole("listitem", { name });
  await expect(card).toContainText("Spoke with the office manager.");
  await expect(card).toContainText("Follow up");

  // They replied: +8 from the research weights, from Warm up next to Reach out first.
  // The card is drawn again in its new column, so its log opens again.
  await card.getByText(/^Log a call, email or meeting/).click();
  await card.getByRole("combobox", { name: "What happened" }).click();
  await page.getByRole("option", { name: "They replied" }).click();
  await card.getByRole("button", { name: "Log it" }).click();
  card = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name });
  await expect(card).toContainText("Reach out first");
  await expect(card).toContainText("They answered your letter");

  await page.reload();
  card = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name });
  await expect(card).toContainText("Reach out first");
  expect(errors).toEqual([]);
});

test("they referred someone: only a count, and the confidentiality rule is shown", async ({ page }) => {
  await page.goto("/referrals");
  const card = page.getByRole("listitem", { name: "[Sample] Lincoln Park Pediatrics" });
  await card.getByText(/^Log a call, email or meeting/).click();
  await expect(card).toContainText("Referred someone to you 1 time.");
  await expect(card).toContainText("never tells the referrer that someone became your client");
  await expect(card).toContainText("Introduced by [Sample] my old supervisor");
});

test("Referrals v2 board passes axe with the log and sources open", async ({ page }) => {
  await page.goto("/referrals");
  const card = page.getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" });
  await card.getByText("What each source says").click();
  await card.getByText(/^Log a call, email or meeting/).click();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length} (${v.nodes[0]?.target.join(" ")})`)).toEqual([]);
});

test("live: search, add to the board, and the card shows the NPI Registry as a source", async ({ page }) => {
  await page.goto("/referrals");
  await expect(page.getByText(/^\d+ in 60614/)).toBeVisible({ timeout: 120_000 });
  const add = page.getByRole("region", { name: "Referral sources by tier" }).getByRole("button", { name: /^Add to board: / }).first();
  const name = (await add.getAttribute("aria-label"))!.replace("Add to board: ", "");
  await add.click();
  const card = page.getByRole("region", { name: "Found" }).getByRole("listitem", { name });
  await expect(card.getByTestId("evidence")).toContainText("Confirmed by: NPI Registry", { timeout: 30_000 });
});
