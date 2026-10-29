import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Approve a test note: Waiting for you, then Done", async ({ page }) => {
  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await expect(card.getByText("Waiting for you")).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Done")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("Done");
});

test("The failing note ends as Failed with its error", async ({ page }) => {
  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  const after = page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" });
  await expect(after.getByText("Failed", { exact: true })).toBeVisible();
  await expect(after.getByText("Test failure requested (payload.fail is true).")).toBeVisible();
});

test("Every seeded approval works in test mode, except the one that fails on purpose", async ({ page }) => {
  // The demo has to survive db:reset: each [Sample] approval, once approved, ends Done.
  await page.goto("/approvals");
  const pending = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Approve", exact: true }) });
  await expect(pending.first()).toBeVisible();
  const names: string[] = [];
  for (let n = await pending.count(); n > 0; n--) {
    const card = pending.first();
    const name = await card.evaluate(
      (el) => el.getAttribute("aria-label") ?? document.getElementById(el.getAttribute("aria-labelledby") ?? "")?.textContent ?? "",
    );
    names.push(name);
    await card.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByRole("listitem", { name }).getByText(/^(Done|Failed)$/)).toBeVisible({ timeout: 15_000 });
  }
  expect(names.length).toBeGreaterThan(3);
  for (const name of names) {
    const outcome = name.includes("fails on purpose") ? "Failed" : "Done";
    await expect(page.getByRole("listitem", { name }).getByText(outcome, { exact: true }), name).toBeVisible();
  }
});

test("Edit then approve runs the edited text", async ({ page }) => {
  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await card.getByRole("button", { name: "Edit then approve" }).click();
  await card.getByRole("textbox").fill("[Sample] Edited by Dana before approving.");
  await card.getByRole("button", { name: "Approve edited version" }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Done")).toBeVisible();
});

test("Decline marks it Declined", async ({ page }) => {
  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" });
  await card.getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] Test note: hello from Aeon" }).getByText("Declined")).toBeVisible();
});

for (const path of ["/", "/approvals", "/admin", "/admin/deadlines", "/settings"]) {
  test(`No serious accessibility issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Screenshots of Home and the failed state", async ({ page }, info) => {
  await page.goto("/approvals");
  await page.getByRole("listitem", { name: "[Sample] Test note: this one fails on purpose" }).getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText("Failed", { exact: true })).toBeVisible();
  await page.screenshot({ path: `test/screens/approvals-${info.project.name}.png`, fullPage: true });
});
