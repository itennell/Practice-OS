import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

test("Referrals board: five columns, sample cards, Move to menu moves and announces", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/referrals");
  for (const col of ["Found", "Contacted", "Follow up", "Connected", "Not a fit"]) {
    await expect(page.getByRole("region", { name: col })).toBeVisible();
  }
  const found = page.getByRole("region", { name: "Found" });
  const card = found.getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" });
  await expect(card).toContainText("Family medicine");
  await expect(card).toContainText("0.6 mi");
  await expect(card.getByLabel("Fit score 81 out of 100")).toBeVisible();

  // Keyboard and screen-reader way: the Move to menu.
  await card.getByRole("combobox", { name: "Move to" }).click();
  await page.getByRole("option", { name: "Connected" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Moved [Sample] Lakeview Family Medicine to Connected." })).toBeAttached();
  await expect(page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Connected" }).getByRole("listitem", { name: "[Sample] Lakeview Family Medicine" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Referrals board passes axe", async ({ page }) => {
  await page.goto("/referrals");
  await expect(page.getByRole("region", { name: "Found" })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});

test("Referrals changes only come from the app's own page, as JSON", async ({ request, baseURL }) => {
  const board = await request.get("/api/menu");
  expect(board.ok()).toBe(true);
  const id = "00000000-0000-4000-8000-000000000203"; // [Sample] Old Town OB-GYN
  const own = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL! }, data: { stage: "connected" } });
  expect(own.status()).toBe(200);
  expect((await own.json()).card.stage).toBe("connected");

  const otherSite = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: "https://evil.example" }, data: { stage: "not_a_fit" } });
  expect(otherSite.status()).toBe(403);
  const form = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL!, "content-type": "text/plain" }, data: '{"stage":"not_a_fit"}' });
  expect(form.status()).toBe(403);
  const back = await request.post(`/api/referrals/${id}/stage`, { headers: { origin: baseURL! }, data: { stage: "follow_up" } });
  expect(back.status()).toBe(200);
});
