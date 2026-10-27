import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Good Faith Estimates tab: timing check uses her hours, and the sample PDF still works", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/paperwork");
  await expect(page.getByRole("link", { name: "Good Faith Estimates" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "New Good Faith Estimate" })).toBeVisible();

  // Thanksgiving week, Dana open Mon-Thu [Sample]: 10 open days out, due Wed Dec 2.
  await expect(page.getByText(/Give it by Wed, Dec 2, 2026/)).toBeVisible();
  await page.getByLabel("Or: client asked on").fill("2026-11-10");
  await expect(page.getByText(/Give it by Tue, Nov 17, 2026/)).toBeVisible();

  const pdf = await request.get("/api/gfe/sample");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("Credentialing: profile, CAQH date that matches Deadlines, and the attest line", async ({ page }) => {
  await page.goto("/paperwork");
  await page.getByRole("link", { name: "Credentialing" }).click();
  await expect(page).toHaveURL(/tab=credentialing/);
  await expect(page.getByRole("heading", { name: "Credentialing profile" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "License" }).getByText(/License number: not stored here/)).toBeVisible();
  await expect(page.getByText("Upload your renewed malpractice face sheet")).toBeVisible();
  await expect(page.getByText("You must log in and click Attest yourself.")).toBeVisible();

  const attestBy = await page.getByText(/Re-attest by/).locator("strong").innerText();
  await page.goto("/deadlines");
  const caqh = page.getByRole("listitem", { name: "CAQH re-attestation (Illinois: every 180 days)" });
  await expect(caqh.getByText(`Due ${attestBy}`)).toBeVisible();
});

for (const path of ["/paperwork", "/paperwork?tab=credentialing"]) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Screenshots of Paperwork", async ({ page }, info) => {
  for (const [name, path] of [
    ["gfe", "/paperwork"],
    ["credentialing", "/paperwork?tab=credentialing"],
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test/screens/paperwork-${name}-${info.project.name}.png`, fullPage: true });
  }
});
