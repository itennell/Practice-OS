import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { typeDate } from "../helpers/controls";

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
  await typeDate(page, "Or: client asked on", "2026-11-10");
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

test("Superbills tab: the sample, a new one by hand, its PDF and Mark given", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/paperwork");
  await page.getByRole("link", { name: "Superbills" }).click();
  await expect(page).toHaveURL(/tab=superbills/);
  await expect(page.getByRole("heading", { name: "New superbill" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "SB-2026-0001" })).toContainText("4 sessions, $700.00");

  // A new one by hand: one video session from home at her $175 fee, nothing paid yet.
  await typeDate(page, "Date 1", "2026-10-20");
  await page.getByLabel("Fee ($)").fill("175");
  await page.getByRole("button", { name: "Save superbill" }).click();
  await expect(page.getByRole("status")).toContainText(/Saved as SB-\d{4}-\d{4}/);
  const reference = (await page.getByRole("status").innerText()).match(/SB-\d{4}-\d{4}/)![0];
  const item = page.getByRole("listitem", { name: reference });
  await expect(item).toContainText("Ready for you");

  const href = await item.getByRole("link", { name: /Download PDF/ }).getAttribute("href");
  const pdf = await request.get(href!);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await item.getByRole("button", { name: /Mark given/ }).click();
  await expect(item).toContainText("Given to client");
  expect(errors).toEqual([]);
});

test("Release forms tab: blank and revocation PDFs, a filled form downloads, blanket releases refused", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/paperwork");
  await page.getByRole("link", { name: "Release forms" }).click();
  await expect(page).toHaveURL(/tab=release/);
  await expect(page.getByRole("heading", { name: "Release of information (Illinois)" })).toBeVisible();

  for (const kind of ["blank", "revocation"]) {
    const pdf = await request.get(`/api/release-forms/pdf?kind=${kind}`);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  }

  await page.getByLabel("Release to (person or agency)").fill("Dr. Lee, Northside Clinic [Sample]");
  await page.getByLabel("Purpose").fill("Coordinate care");
  await page.getByLabel("Exactly what to release").fill("All records");
  await typeDate(page, "Consent ends on (required)", "2027-06-30");
  await page.getByRole("button", { name: "Download filled form" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "blanket" })).toBeVisible();

  await page.getByLabel("Exactly what to release").fill("Dates of attendance");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download filled form" }).click();
  expect((await download).suggestedFilename()).toBe("release-of-information.pdf");
  await expect(page.getByRole("status")).toContainText("Downloaded");
  // The one 400 is the blanket release the server refused on purpose.
  expect(errors.filter((e) => !e.includes("status of 400"))).toEqual([]);
});

for (const path of ["/paperwork", "/paperwork?tab=superbills", "/paperwork?tab=release", "/paperwork?tab=credentialing"]) {
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
    ["superbills", "/paperwork?tab=superbills"],
    ["release", "/paperwork?tab=release"],
    ["credentialing", "/paperwork?tab=credentialing"],
  ]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `test/screens/paperwork-${name}-${info.project.name}.png`, fullPage: true });
  }
});
