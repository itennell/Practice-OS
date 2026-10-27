import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { loadEnv } from "../../lib/env";
import { TEST_RULE_ID, sampleResearch } from "../helpers/researched-rule";

loadEnv();

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.afterAll(async () => {
  const { db, closeDb } = await import("../../lib/db");
  const { syncCalendar } = await import("../../lib/compliance/store");
  await db()`delete from practice_os.compliance_rules where id = ${TEST_RULE_ID}`;
  await syncCalendar();
  await closeDb();
});

test("Approve researched rules, see the badge on Deadlines, then confirm one", async ({ page }, info) => {
  const { queueStateRules } = await import("../../lib/compliance/researched");
  const { practiceToday } = await import("../../lib/compliance/store");
  const { ctx, results } = sampleResearch(await practiceToday());
  await queueStateRules(ctx, results, "aeon:research");

  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: /Illinois rules for your LCPC license to review/ });
  await expect(card.getByText("[Sample] Researched rule for tests")).toBeVisible();
  await expect(card.getByText(/quote found on the page/)).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: /Illinois rules for your LCPC license to review/ }).getByText("Done")).toBeVisible();

  await page.goto("/deadlines");
  const rule = page.getByRole("listitem", { name: "[Sample] Researched rule for tests" });
  await expect(rule.getByText(/Aeon researched this\. Please confirm it with your board\./)).toBeVisible();
  await expect(rule.getByText(/found this quote on the official page/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  await rule.screenshot({ path: `test/screens/researched-rule-${info.project.name}.png` });
  await rule.getByRole("button", { name: "I checked it: [Sample] Researched rule for tests" }).click();
  await expect(rule.getByRole("status")).toHaveText(/Confirmed by you/);

  await page.reload();
  await expect(page.getByRole("listitem", { name: "[Sample] Researched rule for tests" }).getByText("Researched by Aeon, confirmed by you.")).toBeVisible();
});
