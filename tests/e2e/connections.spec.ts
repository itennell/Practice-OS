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
  // Each Connect button is a small form that POSTs to the start route with its scopes.
  const formOf = (name: string) => google.locator("form").filter({ has: page.getByRole("button", { name }) });
  await expect(formOf("Connect Gmail drafts")).toHaveAttribute("action", "/api/connect/google/start");
  await expect(formOf("Connect Gmail drafts").locator('input[name="scopes"]')).toHaveValue(/gmail\.compose$/);
  await expect(formOf("Connect Google Calendar").locator('input[name="scopes"]')).toHaveValue(/calendar\.events,.*calendar\.freebusy$/);

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
