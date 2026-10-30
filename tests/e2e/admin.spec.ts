import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { shown, typeDate } from "../helpers/controls";

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Good Faith Estimates panel: booked today by default, timing check uses her hours, the sample PDF works", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin");
  await page.getByRole("link", { name: "Good Faith Estimate", exact: true }).click();
  await expect(page).toHaveURL(/panel=gfe/);
  const panel = page.getByRole("dialog", { name: "Good Faith Estimates" });
  await expect(panel.getByRole("heading", { name: "New Good Faith Estimate" })).toBeVisible();
  // "Booked on" starts on today, so she only changes what's different.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date());
  await expect(panel.getByLabel("Booked on", { exact: true }).first()).toHaveValue(shown(today));

  // Thanksgiving week, Dana open Mon-Thu [Sample]: 10 open days out, due Wed Dec 2.
  await expect(page.getByText(/Give it by Wed, Dec 2, 2026/)).toBeVisible();
  await typeDate(page, "Or: client asked on", "2026-11-10");
  await expect(page.getByText(/Give it by Tue, Nov 17, 2026/)).toBeVisible();

  const pdf = await request.get("/api/gfe/sample");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect(errors).toEqual([]);
});

test("Credentialing panel: profile, CAQH date that matches Deadlines, and the attest line", async ({ page }) => {
  await page.goto("/admin");
  await page.getByRole("link", { name: "Credentialing" }).click();
  await expect(page).toHaveURL(/panel=credentialing/);
  await expect(page.getByRole("heading", { name: "Credentialing profile" })).toBeVisible();
  await expect(page.getByRole("listitem", { name: "License" }).getByText(/License number: not stored here/)).toBeVisible();
  await expect(page.getByText("Upload your renewed malpractice face sheet")).toBeVisible();
  await expect(page.getByText("You must log in and click Attest yourself.")).toBeVisible();

  const attestBy = await page.getByText(/Re-attest by/).locator("strong").innerText();
  await page.goto("/admin/deadlines");
  const caqh = page.getByRole("listitem", { name: "CAQH re-attestation (Illinois: every 180 days)" });
  await expect(caqh.getByText(`Due ${attestBy}`)).toBeVisible();
});

test("Superbills panel: the sample, a new one by hand, its PDF and Mark given", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin");
  await page.getByRole("link", { name: "Superbill", exact: true }).click();
  await expect(page).toHaveURL(/panel=superbill/);
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

test("Release form panel: blank and revocation PDFs, a filled form downloads, blanket releases refused", async ({ page, request }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin");
  await page.getByRole("link", { name: "Release form", exact: true }).click();
  await expect(page).toHaveURL(/panel=release/);
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

const PANELS = ["forms", "gfe", "superbill", "release", "credentialing", "insurance", "hours"];

for (const path of ["/admin", ...PANELS.map((p) => `/admin?panel=${p}`)]) {
  test(`${path} has no serious accessibility problems`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    // Let the panel finish sliding in: axe measures text mid-transition as low contrast.
    await page.waitForFunction(() =>
      document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
    );
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Admin opens on what the practice needs next, each with one button", async ({ page }) => {
  await page.goto("/admin");
  const needs = page.getByRole("region", { name: "What your practice needs next" });
  await expect(needs).toBeVisible();
  const items = needs.getByRole("listitem");
  expect(await items.count()).toBeGreaterThan(0);
  // [Sample] Dana: CAQH re-attestation is due this week, so it leads with a button that starts a chat.
  const caqh = needs.getByRole("listitem", { name: /CAQH re-attestation/ });
  await expect(caqh).toBeVisible();
  await caqh.getByRole("link", { name: /Get me ready/ }).click();
  await expect(page).toHaveURL(/\/\?ask=/);
  // The question waits in the box: Aeon never sends it for her.
  await expect(page.getByRole("textbox", { name: "Message Aeon" })).toHaveValue("Get me ready for CAQH");
  await expect(page.getByRole("log", { name: "Conversation" })).toHaveCount(0);
});

test("Admin's six cards, and a panel that closes back to Admin", async ({ page }) => {
  await page.goto("/admin");
  const cards = page.getByRole("region", { name: "Everything, when you want it" }).getByRole("heading", { level: 3 });
  await expect(cards).toHaveText(["Deadlines", "Client forms", "Credentialing", "Insurance", "How do I", "Office hours and fees"]);
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Office hours and fees" }).click();
  const panel = page.getByRole("dialog", { name: "Office hours and fees" });
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Old links go to Admin", async ({ page }) => {
  for (const [from, to] of [
    // The old ?tab= rides along unused; the panel is what opens.
    ["/paperwork", /\/admin\?panel=gfe$/],
    ["/paperwork?tab=superbills", /\/admin\?.*panel=superbill$/],
    ["/paperwork?tab=credentialing", /\/admin\?.*panel=credentialing$/],
    ["/dashboard", /\/admin$/],
    ["/deadlines", /\/admin\/deadlines$/],
    ["/how-do-i", /\/admin\/how-do-i$/],
    ["/how-do-i/illinois-pllc", /\/admin\/how-do-i\/illinois-pllc$/],
  ] as const) {
    await page.goto(from);
    await expect(page).toHaveURL(to);
  }
});

test("Screenshots of Admin", async ({ page }, info) => {
  for (const [name, path] of [["home", "/admin"], ...PANELS.map((p) => [p, `/admin?panel=${p}`])]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    await page.screenshot({ path: `test/screens/admin-${name}-${info.project.name}.png`, fullPage: name === "home" });
  }
});
