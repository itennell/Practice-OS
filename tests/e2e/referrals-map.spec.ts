import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// The Referrals map and tiered list, against the live NPI Registry, Census
// geocoder and OpenFreeMap tiles (so this needs the internet). The demo
// practice's Referrals ZIP is 60614.

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test.setTimeout(180_000);

/** Waits for the map and returns where on screen each rendered pin is. */
async function pinsOnScreen(page: Page) {
  await expect.poll(() => page.evaluate(() => [...document.querySelectorAll("div")].some((d) => "referralMap" in d)), { timeout: 60_000 }).toBe(true);
  return page.evaluate(async () => {
    type M = {
      loaded(): boolean;
      queryRenderedFeatures(o: { layers: string[] }): { properties: { npi: string; name: string }; geometry: { coordinates: [number, number] } }[];
      project(c: [number, number]): { x: number; y: number };
      getCanvas(): HTMLCanvasElement;
    };
    const box = [...document.querySelectorAll("div")].find((d) => "referralMap" in d)!;
    box.scrollIntoView({ block: "center" });
    const m = (box as unknown as { referralMap: M }).referralMap;
    for (let i = 0; i < 60 && !m.loaded(); i++) await new Promise((r) => setTimeout(r, 250));
    await new Promise((r) => setTimeout(r, 800));
    const rect = m.getCanvas().getBoundingClientRect();
    return m.queryRenderedFeatures({ layers: ["pins", "clusters"] }).map((f) => {
      const p = m.project(f.geometry.coordinates);
      return { npi: f.properties.npi, name: f.properties.name, x: rect.left + p.x, y: rect.top + p.y };
    });
  });
}

async function waitForResults(page: Page, label: string) {
  await expect(page.getByText(new RegExp(`^\\d+ in ${label}`))).toBeVisible({ timeout: 120_000 });
}

test("Referrals map: 60614 pins and a tiered list, pin and row pick each other, other ZIPs and Chicagoland", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  await waitForResults(page, "60614");

  const tiers = page.getByRole("region", { name: "Referral sources by tier" });
  for (const t of ["Reach out first", "Warm up next", "Later"]) await expect(tiers.getByRole("heading", { name: new RegExp(`^${t}`) })).toBeVisible();
  const firstRow = tiers.getByRole("listitem").first();
  await expect(firstRow).toContainText("Why reach out first:");
  await expect(firstRow).toContainText(/Individual clinician|Group or clinic/);

  const pins = await pinsOnScreen(page);
  expect(pins.length).toBeGreaterThan(0);

  // A row's "Show on map" zooms to its pin; clicking that pin picks the same row.
  const rowName = (await firstRow.getByRole("heading", { level: 4 }).textContent())!;
  await firstRow.getByRole("button", { name: `Show on map: ${rowName}` }).click();
  await expect(firstRow).toHaveAttribute("aria-current", "true");
  const near = (await pinsOnScreen(page)).filter((p) => p.npi);
  expect(near.length).toBeGreaterThan(0);
  const other = near.find((p) => p.name !== rowName) ?? near[0];
  await page.mouse.click(other.x, other.y);
  const picked = page.locator('li[aria-current="true"]');
  await expect(picked).toHaveCount(1);
  await expect(picked.getByRole("heading", { level: 4 })).toHaveText(other.name);
  await expect(picked).toBeInViewport();

  // Another ZIP.
  const area = page.getByRole("textbox", { name: "Area" });
  await area.fill("60657");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await waitForResults(page, "60657");
  expect((await pinsOnScreen(page)).length).toBeGreaterThan(0);

  // All of Chicagoland.
  await page.getByRole("button", { name: "All of Chicagoland" }).click();
  await waitForResults(page, "All of Chicagoland");
  await expect(page.getByText(/part of Chicagoland/)).toBeVisible();
  expect((await pinsOnScreen(page)).length).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("Draft email, then Copy puts the subject and letter on the clipboard", async ({ page, context, browserName }) => {
  test.skip(browserName !== "chromium", "clipboard permissions are Chromium-only here");
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  // Muse writes the letter in real use; here a fixed one stands in so the test doesn't need a model key.
  const letter =
    "[Sample] Dear Old Town OB-GYN team,\n\nI'm Dana Reyes, a counselor in Lincoln Park. I wrote a few weeks ago and wanted to check in. " +
    "Would a 15-minute call to introduce ourselves still work for you?\n\nDana Reyes, LCPC (fictional demo practice)";
  await page.route("**/api/referrals/*/draft", (route) =>
    route.fulfill({ json: { approval_id: "00000000-0000-4000-8000-0000000009aa", subject: "[Sample] Checking in from Reyes Counseling", letter } }),
  );
  await page.goto("/referrals");
  const card = page.getByRole("region", { name: "Follow up" }).getByRole("listitem", { name: "[Sample] Old Town OB-GYN" });
  await card.getByRole("button", { name: "Draft a check-in email" }).click();
  await expect(card).toContainText("Email to send yourself");
  await expect(card).toContainText("Open your email and start a new message");
  await card.getByRole("button", { name: "Copy email to [Sample] Old Town OB-GYN" }).click();
  await expect(card.getByRole("button", { name: "Copy email to [Sample] Old Town OB-GYN" })).toHaveText("Copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`Subject: [Sample] Checking in from Reyes Counseling\n\n${letter}`);

  // The seeded letter (no stand-in) copies the same way.
  const lakeview = page.getByRole("region", { name: "Found" }).getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" });
  await lakeview.getByRole("button", { name: "Copy email to [Sample] Lakeview Family Medicine" }).click();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/^Subject: \[Sample\] Introducing Reyes Counseling in Lincoln Park\n\n\[Sample\] Dear Lakeview Family Medicine team,/);
  expect(copied).toContain("Dana Reyes, LCPC (fictional demo practice)");
});

for (const scheme of ["light", "dark"] as const) {
  test(`Referrals map page passes axe (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto("/referrals");
    await waitForResults(page, "60614");
    await pinsOnScreen(page);
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
