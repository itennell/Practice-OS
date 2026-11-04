import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Settings › Connections: the page shell and the Muse key card, the one connection.

test("Connections shows the Muse key card with its own check", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("link", { name: "Open Connections" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Connections" })).toBeVisible();

  const muse = page.getByRole("region", { name: "Aeon (Meta Muse)" });
  await expect(muse.getByRole("link", { name: "Meta’s developer page" })).toHaveAttribute("href", "https://dev.meta.ai/");
  await expect(muse.getByRole("button", { name: "Check and connect" })).toBeDisabled();
  await muse.getByLabel("Your Muse key").fill("not-a-real-key-but-long-enough");
  await expect(muse.getByRole("button", { name: "Check and connect" })).toBeEnabled();

  // No other connection cards: Google, Instagram and the phone line are gone.
  for (const name of ["Google", "Instagram", "Practice phone", "Urgent alerts to your phone"]) {
    await expect(page.getByRole("region", { name, exact: true })).toHaveCount(0);
  }

  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
});
