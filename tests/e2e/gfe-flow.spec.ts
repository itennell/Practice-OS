import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick, shown, typeDate } from "../helpers/controls";

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Draft an estimate, approve it, then make the PDF with details that aren't saved", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/paperwork");
  // Wait for the form to be interactive, or a fill can land before hydration and be reset.
  await page.waitForLoadState("networkidle");
  const form = page.getByRole("form").or(page.locator("form").first());
  await typeDate(page, "Booked on", "2026-11-25", { nth: 0 });
  await expect(page.getByLabel("Booked on", { exact: true }).first()).toHaveValue(shown("2026-11-25"));
  await typeDate(page, "First visit", "2026-12-15");
  await pick(page, page, "Service 1", /^90791/);
  await page.getByRole("button", { name: "Add a service" }).click();
  await pick(page, page, "Service 2", /^90837/);
  await page.getByLabel("How many").nth(1).fill("40");
  // Dana is open Mon-Thu [Sample]: 10 open days out, so 3 open days after Wed Nov 25.
  await expect(form.getByText(/Total \$7,200\.00/)).toBeVisible();
  await expect(form.getByText(/Give it to the client by Wed, Dec 2, 2026/)).toBeVisible();
  await page.getByRole("button", { name: "Send to Approvals" }).click();
  await expect(page.getByRole("status").filter({ hasText: /Saved as GFE-2026-\d{4}/ })).toBeVisible();

  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: /individual therapy, \$7,200\.00/ });
  await expect(card.getByText(/Give it to the client by 2026-12-02/)).toBeVisible();
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: /individual therapy, \$7,200\.00/ }).getByText("Done")).toBeVisible();

  await page.goto("/paperwork");
  const row = page.getByRole("listitem").filter({ hasText: /individual therapy, \$7,200\.00/ });
  await expect(row.getByText("Issued on time")).toBeVisible();
  await row.getByText("Make the PDF").click();
  await row.getByLabel("First name").fill("Casey");
  await row.getByLabel("Last name").fill("Example");
  await typeDate(row, "Date of birth", "1991-02-03");
  await row.getByLabel("Street").fill("200 Sample Ave");
  await row.getByLabel("City").fill("Chicago");
  await row.getByLabel("ZIP").fill("60614");
  const download = page.waitForEvent("download");
  await row.getByRole("button", { name: /Make PDF for GFE-/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^GFE-2026-\d{4}\.pdf$/);
  await expect(row.getByText("PDF downloaded. The details you typed weren't saved.")).toBeVisible();
  await expect(row.getByLabel("First name")).toHaveValue("");
  expect(errors).toEqual([]);
});

test("Office hours in Settings change the due date", async ({ page }) => {
  await page.goto("/settings");
  const friday = page.getByRole("button", { name: "Fri" });
  await expect(friday).toHaveAttribute("aria-pressed", "false");
  await friday.click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved. New estimates use these hours and fees.")).toBeVisible();

  await page.goto("/paperwork");
  // Open Mon-Fri now: the Thanksgiving-week booking is due Tue Dec 1, not Wed Dec 2.
  await expect(page.getByText(/Give it by Tue, Dec 1, 2026/)).toBeVisible();
});

test("The seeded estimates show issued and waiting", async ({ page }) => {
  await page.goto("/paperwork");
  await expect(page.getByRole("listitem", { name: "GFE-2026-0001" }).getByText("Issued on time")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "GFE-2026-0002" }).getByText("Waiting for you")).toBeVisible();
});

for (const path of ["/paperwork", "/settings"]) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Open the first "Make the PDF" panel so its form is checked too.
    if (await page.locator("details").count()) await page.locator("details").first().evaluate((d) => ((d as HTMLDetailsElement).open = true));
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Screenshots of the estimate flow", async ({ page }, info) => {
  for (const [name, path] of [
    ["gfe-saved", "/paperwork"],
    ["settings-office", "/settings"],
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test/screens/${name}-${info.project.name}.png`, fullPage: true });
  }
});
