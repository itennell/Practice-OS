import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick } from "../helpers/controls";

// Keeping in touch at phone width (390px), on the fictional demo practice: a
// card shows its reciprocity line, "I referred someone to them" logs a date and
// a count (nothing else) and the line updates; a card past its cadence shows
// "Going cold"; the board's views show the going-cold cards and the people she
// refers to with her notes about them. axe-clean, nothing wider than the phone.
// No model call, no internet.

test.use({ viewport: { width: 390, height: 844 } });

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});
test.afterAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(120_000);

const PEDIATRICS = "[Sample] Fernhollow Pediatrics";
const ROBIN = "[Sample] Dr. Robin Example, PsyD";

async function axeClean(page: Page) {
  await page.waitForTimeout(300);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
}

test("log a refer-out and see reciprocity, going cold and the people I refer to", async ({ page }) => {
  // The map searches the live NPI Registry; the board is what this checks.
  await page.route("**/api/referrals/area", (route) => route.fulfill({ status: 503, json: { error: "[Sample] offline in this test" } }));
  await page.goto("/referrals");

  const card = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: PEDIATRICS });
  await expect(card.getByTestId("reciprocity")).toHaveText("They've referred 1 · You've referred 2");

  await card.getByText("Referring out to them").click();
  await pick(page, card, "How many people", "3 people");
  const saved = page.waitForResponse((r) => r.url().includes("/refer-out") && r.request().method() === "POST");
  await card.getByRole("button", { name: `I referred someone to ${PEDIATRICS}` }).click();
  const post = await saved;
  expect(post.ok()).toBe(true);
  // A date and a count, nothing about who.
  expect(Object.keys(post.request().postDataJSON() as object).sort()).toEqual(["count", "happened_on"]);
  await expect(card.getByTestId("reciprocity")).toHaveText("They've referred 1 · You've referred 5");
  await expect(page.getByText(/Only the date and the count are kept\./).first()).toBeAttached();
  await axeClean(page);

  // Robin was last in touch 100 days ago: past every tier's cadence plus grace.
  const robin = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: ROBIN });
  await expect(robin.getByTestId("going-cold")).toContainText("Going cold: last contact 14 weeks ago");
  await expect(robin.getByRole("button", { name: "Draft a follow-up note" })).toBeVisible();

  const views = page.getByRole("group", { name: "Board view" });
  await views.getByRole("button", { name: /^Going cold/ }).click();
  await expect(views.getByRole("button", { name: /^Going cold/ })).toHaveAttribute("aria-pressed", "true");
  await expect(robin).toBeVisible();
  await expect(page.getByRole("listitem", { name: PEDIATRICS })).toHaveCount(0);
  await axeClean(page);

  await views.getByRole("button", { name: /^People I refer to/ }).click();
  const list = page.getByRole("region", { name: "People I refer to" });
  await expect(list.getByRole("listitem", { name: ROBIN })).toContainText("[Sample] Openings on Tuesday evenings");
  await expect(list.getByRole("listitem", { name: ROBIN })).toContainText("They've referred 0 · You've referred 1");
  await expect(list.getByRole("listitem", { name: PEDIATRICS })).toContainText("You've referred 5");
  await expect(list.getByRole("heading", { name: "Psychologist" })).toBeVisible();
  await axeClean(page);
});
