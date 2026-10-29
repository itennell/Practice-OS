import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Settings › Connections: the page shell, the Muse key card and the Google card.
// The Connect buttons go to Google's or Meta's own pages, so this checks where
// they point rather than signing in.

test("Connections lists each helper with its Connect button", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Open Connections" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Connections" })).toBeVisible();

  const muse = page.getByRole("region", { name: "Aeon (Meta Muse)" });
  await expect(muse.getByRole("link", { name: "Meta’s developer page" })).toHaveAttribute("href", "https://dev.meta.ai/");
  await expect(muse.getByRole("button", { name: "Check and connect" })).toBeDisabled();
  await muse.getByLabel("Your Muse key").fill("not-a-real-key-but-long-enough");
  await expect(muse.getByRole("button", { name: "Check and connect" })).toBeEnabled();

  const google = page.getByRole("region", { name: "Google" });
  await expect(google.getByText("Not connected")).toBeVisible();
  // Google buttons only show on a copy with its own Google client (otherwise the card says "later").
  if (process.env.GOOGLE_CLIENT_ID) {
    // Each Connect button is a small form that POSTs to the start route with its scopes.
    const formOf = (name: string) => google.locator("form").filter({ has: page.getByRole("button", { name }) });
    await expect(formOf("Connect Gmail drafts")).toHaveAttribute("action", "/api/connect/google/start");
    await expect(formOf("Connect Gmail drafts").locator('input[name="scopes"]')).toHaveValue(/gmail\.compose$/);
    await expect(formOf("Connect Google Calendar").locator('input[name="scopes"]')).toHaveValue(/calendar\.events,.*calendar\.freebusy$/);
  }

  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});

test("A sign-in that comes back with an error says so once, in words", async ({ page }) => {
  await page.goto("/settings/connections?error=Sign-in%20was%20cancelled.");
  await expect(page.getByText("Sign-in was cancelled.")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/connections$/);
});

const axeSerious = async (page: import("@playwright/test").Page) => {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("Google says it comes later on a copy with no Google client", async ({ page }) => {
  test.skip(Boolean(process.env.GOOGLE_CLIENT_ID), "This copy has a Google client.");
  await page.goto("/settings/connections");
  const google = page.getByRole("region", { name: "Google" });
  await expect(google.getByText(/Gmail drafts come later/)).toBeVisible();
  await expect(google.getByRole("button", { name: /Connect Gmail/ })).toHaveCount(0);
});

test("Instagram needs no connection: Aeon writes posts with her, she posts them", async ({ page }) => {
  await page.goto("/settings/connections");
  const ig = page.getByRole("region", { name: "Instagram", exact: true });
  await expect(ig.getByText("No connection needed. Aeon writes posts with you; you post them yourself.")).toBeVisible();
  await expect(ig.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Instagram isn't ready on this copy yet.")).toHaveCount(0);
});

test("The phone card walks her through her own Twilio number, one step at a time", async ({ page }) => {
  test.skip(process.env.FRONT_DESK_DEV_TWILIO === "true", "The developer demo line is on, so the phone card shows it instead.");
  await page.goto("/settings/connections");
  await page.evaluate(() => localStorage.removeItem("practice-os:twilio-setup"));
  await page.reload();
  const phone = page.getByRole("region", { name: "Practice phone" });
  const steps = phone.getByRole("region", { name: "Set up your Twilio number" });
  await expect(steps.getByText("Step 1 of 4")).toBeVisible();
  await expect(steps.getByRole("link", { name: /Open Twilio/ })).toHaveAttribute("href", "https://www.twilio.com/try-twilio");
  expect(await axeSerious(page)).toEqual([]);
  for (let i = 0; i < 3; i++) await steps.getByRole("button", { name: "Done, next step" }).click();

  // The keys are checked before anything is saved; a wrong shape gets a plain fix.
  await steps.getByLabel("Account SID").fill("SK123");
  await steps.getByLabel("Auth Token").fill("not-a-token");
  await steps.getByRole("button", { name: "Check and connect" }).click();
  await expect(steps.getByText(/starts with AC/)).toBeVisible();
  expect(await axeSerious(page)).toEqual([]);

  // Ticks are remembered in this browser.
  await page.reload();
  await expect(page.getByRole("region", { name: "Set up your Twilio number" }).getByText("Step 4 of 4")).toBeVisible();
});
