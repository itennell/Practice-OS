import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Media > Psychology Today: she answers the few questions only she can, Aeon writes
// every box within its limit, and Copy puts a box's words on her clipboard. Runs on
// the plain templates (no model key in tests), which follow the same limits and lint.

async function violations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.any.map((a) => a.message).join(" ")}`).join(", ")}`);
}

test("Media: answer, write the Psychology Today profile, copy a box", async ({ page, context, browserName }) => {
  test.setTimeout(120_000);
  execSync("npm run db:reset", { stdio: "ignore" });
  if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  // The old Instagram address lands on the Media tab.
  await page.goto("/instagram");
  await expect(page).toHaveURL(/\/media\/instagram$/);

  await page.goto("/media");
  await expect(page.getByRole("heading", { level: 1, name: "Psychology Today and directories" })).toBeVisible();
  expect(await violations(page)).toEqual([]);

  await page.getByLabel("What do people most often come to you for?").fill("Anxiety, big life changes, and couples who feel stuck");
  await page.getByLabel("How do you like to work?").fill("Talk therapy with practical tools");
  await page.getByLabel("What is a first session with you like?").fill("We talk about what brought you in");
  await page.getByLabel("Why do you do this work?").fill("I like helping people feel at home in their lives");
  await page.getByText("Yes, 15 minutes").click();
  await page.getByRole("button", { name: "Save my answers" }).click();

  await page.getByRole("button", { name: "Write my profile" }).click();
  const preview = page.getByTestId("card-preview");
  await expect(preview).toContainText("anxiety");
  await expect(page.getByText("[Sample] Dana Reyes")).toBeVisible();

  // Every box shows its count within its limit.
  for (const count of await page.getByText(/\d+ of \d+ characters/).allTextContents()) {
    const [used, limit] = count.match(/\d+/g)!.map(Number);
    expect(used).toBeLessThanOrEqual(limit);
  }

  const box = page.getByTestId("box-statement_help");
  const words = await box.getByRole("textbox").inputValue();
  await box.getByRole("button", { name: /^Copy / }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(words);
  await page.waitForTimeout(800); // let the "Copied" toast finish fading in before checking contrast
  expect(await violations(page)).toEqual([]);

  // Over the limit: Copy turns off and says why, and the server refuses the save too.
  const intro = page.getByTestId("box-intro");
  await intro.getByRole("textbox").fill("A".repeat(141));
  await expect(intro.getByRole("button", { name: /^Copy / })).toBeDisabled();
  await expect(intro.getByText("Shorten it to 140 characters first.")).toBeVisible();
  const res = await page.request.patch("/api/media/profile", { data: { id: "intro", text: "A".repeat(141) }, headers: { origin: new URL(page.url()).origin } });
  expect(res.status()).toBe(422);
  const advice = await page.request.patch("/api/media/profile", { data: { id: "intro", text: "You should try deep breathing." }, headers: { origin: new URL(page.url()).origin } });
  expect(advice.status()).toBe(422);

  // Website: the recommended path and Aeon's page words.
  await page.getByRole("link", { name: "Website" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Your website" })).toBeVisible();
  await page.getByRole("button", { name: "Write my pages" }).click();
  await expect(page.getByRole("heading", { name: "Practice details for Google" })).toBeVisible();
  await expect(page.getByText(/call or text 988/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Write the pages again" })).toBeEnabled();
  await page.waitForTimeout(300); // the button's colour change from primary to quiet
  expect(await violations(page)).toEqual([]);
});
