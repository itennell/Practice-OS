import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// "Test your Front Desk": a [Sample] voicemail goes through the real pipeline,
// shows in the Inbox with masked number, transcript and safety check, and its
// consult-times text waits in Approvals; approving it in DRY_RUN only logs.
test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

const axe = async (page: import("@playwright/test").Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("[data-sonner-toaster]").analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("Simulate a voicemail, see it in the Inbox, approve its reply in test mode", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/front-desk");

  const consoleCard = page.getByRole("region", { name: "Test your Front Desk" });
  // Only [Sample] traffic so far, so the panel starts open.
  await expect(consoleCard.getByRole("heading", { name: "Try it with your own phone" })).toBeVisible();
  await expect(consoleCard.getByText("Test mode is on")).toBeVisible();
  // No alert phone on a bare install: the test text explains instead of sending.
  await expect(consoleCard.getByRole("button", { name: "Send a test text to my phone" })).toBeDisabled();
  expect(await axe(page)).toEqual([]);

  await consoleCard.getByRole("button", { name: "Simulate a voicemail" }).click();
  const row = page.getByTestId("inbox-row").filter({ hasText: "I'd like to book a first consult" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("[Sample] (•••) •••-0188");
  await expect(row).not.toContainText("555-0188");
  await expect(row).toContainText("Safety check: clear.");
  await row.getByRole("button", { name: "Show number" }).click();
  await expect(row).toContainText("(312) 555-0188");
  await page.getByRole("link", { name: "Voicemails" }).click();
  await expect(page).toHaveURL(/filter=voicemails/);
  await expect(page.getByTestId("inbox-row").filter({ hasText: "I'd like to book a first consult" })).toBeVisible();
  await page.waitForTimeout(400); // the filter chips fade between on and off; mid-fade colors aren't real contrast
  expect(await axe(page)).toEqual([]);

  await page.getByTestId("inbox-row").filter({ hasText: "I'd like to book a first consult" }).getByRole("link", { name: /waiting for you in Approvals/ }).click();
  await expect(page).toHaveURL(/\/approvals/);
  const title = /^\[Sample\] Text \(312\) 555-0188 3 consult times$/;
  const card = page.getByRole("listitem", { name: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: title }).getByText("Done")).toBeVisible({ timeout: 15_000 });

  // Back on Front Desk the reply shows as logged, not sent.
  await page.goto("/front-desk?filter=texts");
  await expect(page.getByTestId("inbox-row").filter({ hasText: "Open consult times" }).first()).toContainText("logged only, not sent");
  expect(errors).toEqual([]);
});

test("Simulate an urgent voicemail: pinned [Sample] crisis alert, fixed 988 reply logged", async ({ page }) => {
  await page.goto("/front-desk");
  const consoleCard = page.getByRole("region", { name: "Test your Front Desk" });
  await consoleCard.getByRole("button", { name: "Simulate an urgent voicemail" }).click();
  const row = page.getByTestId("inbox-row").filter({ hasText: "testing the safety check" });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row).toContainText("Safety check: urgent.");
  await expect(page.getByRole("region", { name: "Needs you" }).getByText(/\[Sample\]/).first()).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
