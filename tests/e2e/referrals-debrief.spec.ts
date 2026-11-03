import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// "Debrief my coffee meeting" at phone width (390px): record on a partner's
// card with Chromium's fake microphone, watch the steps, review what Aeon filled
// in (the patient story is gone, an invented person is left out), save, and see
// the profile, the suggested card and the follow-up in Approvals. Transcription
// and Muse are the fixed stand-ins (PLAYWRIGHT_DEBRIEF_STANDIN=1,
// lib/referrals/debrief-standin.ts); every plain-code check runs for real.

const PARTNER = "[Sample] Lincoln Park Pediatrics";
const PARTNER_ID = "00000000-0000-4000-8000-000000000204";

test.use({
  viewport: { width: 390, height: 844 },
  permissions: ["microphone"],
  launchOptions: {
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
  },
});

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(180_000);

test("debrief a coffee meeting: record, review, save", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  const card = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: PARTNER });
  await card.getByRole("button", { name: "Debrief" }).click();

  // On a wide screen the debrief opens in a side panel, outside the card.
  const box = page.getByRole("region", { name: `Debrief with ${PARTNER}` });
  await expect(box).toContainText("Up to 3 minutes");
  await box.getByRole("button", { name: "Record your debrief" }).click();
  await expect(box).toContainText("stops at 3:00");
  await page.waitForTimeout(1500);
  await box.getByRole("button", { name: "Stop and read the debrief" }).click();

  const review = box.getByRole("form", { name: "Review your debrief" });
  await expect(review).toBeVisible({ timeout: 60_000 });
  // The partner's patient story never reached Muse and isn't on the page.
  await expect(review).toContainText(/Left out 1 sentence that may have been about someone.s patient/);
  await expect(page.getByText("Maria Lopez")).toHaveCount(0);
  // Sam Patel was never named in the debrief: plain code left that out.
  await expect(review).toContainText("Who else to meet: a name you didn't say");
  await expect(review.getByRole("textbox", { name: "Who to ask for" })).toHaveValue("front desk coordinator");
  await expect(review.getByRole("textbox", { name: "Best time to reach them" })).toHaveValue("Tuesday mornings");
  await expect(review).toContainText("Jenna Cho, lactation consultant, Lincoln Park Birth Center");
  await expect(review).toContainText("Lincoln Park Pediatrics' office takes referrals by fax; ask for the front desk coordinator.");
  await expect(review.getByRole("textbox", { name: /Follow-up email/ })).toHaveValue(/Thank you for meeting me for coffee/);

  // Nothing wider than the phone, and axe-clean.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const results = await new AxeBuilder({ page }).include('[data-testid="debrief"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);

  // She edits one answer, then saves.
  await review.getByRole("textbox", { name: "Best time to reach them" }).fill("Tuesday mornings before 10");
  // Jenna Cho becomes a card only once she ticks her as a referral contact.
  await review.getByRole("switch", { name: "Add Jenna Cho as a referral contact" }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/debrief/save"));
  await review.getByRole("button", { name: "Save to card" }).click();
  const res = await saved;
  expect(res.ok(), await res.text()).toBe(true);

  const after = page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: PARTNER });
  const profile = after.getByTestId("partner-profile");
  await expect(profile).toContainText("How they refer: fax");
  await expect(profile).toContainText("Tuesday mornings before 10");
  const suggested = page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Jenna Cho" });
  await expect(suggested).toContainText("Suggested from your debrief");
  await expect(suggested).toContainText("Not contacted");

  await page.goto("/approvals");
  await expect(page.getByText(`Follow-up to ${PARTNER} after your coffee`).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("the chat's debrief card opens the recorder on that partner's card", async ({ page }) => {
  await page.goto(`/referrals?debrief=${PARTNER_ID}`);
  const box = page.getByRole("region", { name: `Debrief with ${PARTNER}` });
  await expect(box).toBeVisible();
  await expect(box.getByRole("button", { name: "Record your debrief" })).toBeVisible();
  const results = await new AxeBuilder({ page }).include('[data-testid="debrief"]').withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
