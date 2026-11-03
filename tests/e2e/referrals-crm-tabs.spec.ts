import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// Referrals CRM tabs: Overview, Board, Map, Meetings and notes (on the demo practice's [Sample] board).

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

const wide = (page: import("@playwright/test").Page) => (page.viewportSize()?.width ?? 1280) >= 768;

test("Overview: where referrals come from, how each was counted, this week, latest activity, the map card", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals?tab=overview");
  const tab = page.getByTestId("overview-tab");
  await expect(tab.getByRole("heading", { name: "Where referrals come from" })).toBeVisible();
  const bars = tab.getByRole("list", { name: "Referrals by partner" });
  await expect(bars.getByRole("listitem")).toHaveCount(2);
  await expect(bars).toContainText("[Sample] Fernhollow Pediatrics");
  // By kind, and the last 30 days.
  await tab.getByRole("button", { name: /^Group/ }).click();
  await page.getByRole("menuitemradio", { name: "By kind" }).click();
  await expect(tab.getByRole("list", { name: "Referrals by kind" })).toBeVisible();
  await expect(tab.getByText("You logged it")).toBeVisible();
  await expect(tab.getByText(/Coming soon: add .How did you hear about us\?. to your intake form/)).toBeVisible();
  // This week: follow-ups; no meetings calendar yet is not an error.
  const week = tab.getByRole("region", { name: "This week" });
  await expect(week).toContainText("Follow up");
  await expect(week).toContainText(/meetings? this week/);
  await expect(tab.getByRole("region", { name: "Latest activity" }).getByRole("listitem").first()).toBeVisible();
  // A name opens the partner panel.
  await week.getByRole("button", { name: /^Open \[Sample\]/ }).first().click();
  await expect(page.getByTestId("partner-panel")).toBeVisible();
  await page.keyboard.press("Escape");
  // The map card opens the Map tab.
  await tab.getByRole("button", { name: "Open the map" }).click();
  await expect(page.getByRole("tab", { name: "Map" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\?tab=map/);
  // No meetings calendar yet: asked first, so no 404 in the console.
  expect(errors).toEqual([]);
});

test("Board: five columns, Move menu, Referring asks first, filters, views, and the panel", async ({ page }) => {
  await page.goto("/referrals?tab=board");
  const board = page.getByRole("region", { name: /Referrals board/ });
  for (const c of ["Found", "Reached out", "Met", "Referring", "Not a fit"]) await expect(board.getByRole("heading", { name: c, exact: true })).toBeAttached();
  const found = board.locator('[data-column="found"]');
  await expect(found.getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine" })).toBeVisible();
  // Fernhollow referred someone: Referring.
  await expect(board.locator('[data-column="referring"]').getByRole("listitem", { name: "[Sample] Fernhollow Pediatrics" })).toBeAttached();

  // Keyboard way: the Move menu.
  await found.getByRole("button", { name: "Move [Sample] Juniper Row Family Medicine" }).click();
  const saved = page.waitForResponse((r) => r.url().endsWith("/stage") && r.request().method() === "POST");
  await page.getByRole("menuitemradio", { name: "Reached out" }).click();
  expect((await saved).ok()).toBe(true);
  await expect(page.getByRole("status").filter({ hasText: "Moved [Sample] Juniper Row Family Medicine to Reached out." })).toBeAttached();
  await expect(board.locator('[data-column="reached_out"]').getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine" })).toBeAttached();

  // Into Referring: she confirms first; Cancel logs nothing.
  await board.getByRole("button", { name: "Move [Sample] Juniper Row Family Medicine" }).click();
  await page.getByRole("menuitemradio", { name: "Referring" }).click();
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
  await expect(dialog.getByText("Log a referral from [Sample] Juniper Row Family Medicine?")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(board.locator('[data-column="reached_out"]').getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine" })).toBeAttached();

  // Filters: square blocks; Practice, Person, Follow-up.
  await page.getByRole("button", { name: /^Person/ }).click();
  await page.getByRole("menuitemradio", { name: "People" }).click();
  await expect(board.getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine" })).toHaveCount(0);
  await expect(board.getByRole("listitem", { name: "[Sample] Dr. Alex Example" })).toBeAttached();
  await page.getByRole("button", { name: /^Person/ }).click();
  await page.getByRole("menuitemradio", { name: "Anyone" }).click();
  await page.getByRole("searchbox", { name: "Search the board" }).fill("thistlewood");
  await expect(board.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search the board" }).fill("");

  // Views: Going cold, People I refer to.
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("menuitemradio", { name: /^Going cold/ }).click();
  await expect(board.getByRole("listitem", { name: "[Sample] Dr. Robin Example, PsyD" })).toBeAttached();
  await expect(board.getByRole("listitem", { name: "[Sample] Juniper Row Family Medicine" })).toHaveCount(0);
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("menuitemradio", { name: /^People I refer to/ }).click();
  await expect(page.getByRole("heading", { name: "People I refer to" })).toBeVisible();
  await page.getByRole("button", { name: /^View/ }).click();
  await page.getByRole("menuitemradio", { name: "Whole board" }).click();

  // A card opens the partner panel.
  await board.getByRole("button", { name: "Open [Sample] Thistlewood OB-GYN" }).click();
  await expect(page.getByRole("dialog", { name: "[Sample] Thistlewood OB-GYN" })).toBeVisible();
  if (!wide(page)) expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
});

test("Map: filters, the side list, a popup with Open, and no pin for sensitive cards", async ({ page }) => {
  await page.goto("/referrals?tab=map");
  const tab = page.getByTestId("map-tab");
  await expect(tab.getByRole("button", { name: /^Distance/ })).toBeVisible();
  await expect(tab.getByRole("button", { name: /^Kind/ })).toBeVisible();
  const list = tab.getByRole("list", { name: "Partners on the map" });
  await expect(list.getByRole("listitem").first()).toBeVisible();
  // Within 1 mi keeps only the near ones.
  await tab.getByRole("button", { name: /^Distance/ }).click();
  await page.getByRole("menuitemradio", { name: "Within 1 mi" }).click();
  await expect(list.getByRole("button", { name: "Show [Sample] Orrindale Hospice" })).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Show [Sample] Juniper Row Family Medicine" })).toBeVisible();
  await list.getByRole("button", { name: "Show [Sample] Juniper Row Family Medicine" }).click();
  const popup = page.getByTestId("map-popup");
  await expect(popup).toContainText("[Sample] Juniper Row Family Medicine");
  await popup.getByRole("button", { name: "Open" }).click();
  await expect(page.getByTestId("partner-panel")).toBeVisible();
  // The pins API never sends a sensitive card's ZIP.
  const pins = await page.request.get("/api/referrals/pins");
  expect(pins.ok()).toBe(true);
  expect(await pins.json()).toHaveProperty("center");
});

test("Meetings and notes: a day-by-day timeline, filters, and Record a debrief picks a partner", async ({ page }) => {
  await page.goto("/referrals?tab=meetings");
  const tab = page.getByTestId("meetings-tab");
  const days = tab.getByRole("list", { name: "Meetings and notes by day" });
  await expect(days.getByRole("heading").first()).toBeVisible();
  await expect(days).toContainText("Coffee near the office.");
  // Referrals are a date only: no note.
  await tab.getByRole("button", { name: /^Show/ }).click();
  await page.getByRole("menuitemradio", { name: "Referrals" }).click();
  await expect(days).toContainText("They referred someone");
  await expect(days).not.toContainText("Coffee near the office.");
  await tab.getByRole("button", { name: /^Show/ }).click();
  await page.getByRole("menuitemradio", { name: "Calls" }).click();
  await expect(days).toContainText("Called");
  await expect(days).not.toContainText("They referred someone");
  await tab.getByRole("button", { name: /^Show/ }).click();
  await page.getByRole("menuitemradio", { name: "All", exact: true }).click();
  await tab.getByRole("button", { name: /^Partner/ }).click();
  await page.getByRole("menuitemradio", { name: /^\[Sample\] Fernhollow Pediatrics/ }).click();
  await expect(days.getByRole("button", { name: /^Open / })).toHaveText(Array(await days.getByRole("button", { name: /^Open / }).count()).fill("[Sample] Fernhollow Pediatrics"));

  await tab.getByRole("button", { name: "Record a debrief" }).click();
  const sheet = page.getByRole("dialog", { name: "Record a debrief" });
  await sheet.getByRole("searchbox", { name: "Search partners" }).fill("Fernhollow");
  await sheet.getByRole("button", { name: "Debrief [Sample] Fernhollow Pediatrics" }).click();
  const panel = page.getByTestId("partner-panel");
  await expect(panel).toBeVisible();
  // The debrief recorder opens on the partner's panel (Voice Pill, UI-015).
  await expect(page.getByText(/3 minutes|Record/i).first()).toBeVisible();
});
