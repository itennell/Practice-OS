import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { REFERRALS_ONLY_DEMO } from "../../lib/features";

test.skip(REFERRALS_ONLY_DEMO, "Hidden in the referrals-only demo (lib/features.ts); these run when REFERRALS_ONLY_DEMO is false.");

// Media > Grow opens in a working state for the demo practice ([Sample] numbers):
// the private-pay plan, Google and Meta ad drafts with their policy checks, and the
// website preview. Downloads stay locked until she approves a draft in Approvals.

async function violations(page: Page) {
  // The website preview is a sandboxed iframe with scripts off, which axe can't inject into; the site
  // itself gets its own axe run below, on its own page.
  const results = await new AxeBuilder({ page }).setLegacyMode(true).options({ iframes: false }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => `${n.target.join(" ")} ${n.any.map((a) => a.message).join(" ")}`).join(", ")}`);
}

test("Grow: plan, ad drafts, website preview; approve the site, then download it", async ({ page }) => {
  test.setTimeout(120_000);
  execSync("npm run db:reset", { stdio: "ignore" });

  await page.goto("/media/grow");
  await expect(page.getByRole("heading", { level: 1, name: "Grow your practice" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Grow" })).toBeVisible();
  await expect(page.getByTestId("plan-headline")).toHaveText("[Sample] You need 9 private-pay clients to replace BCBSIL: 7 more than you have now. 12-week plan.");
  await expect(page.getByText("[Sample] BCBSIL", { exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "12-week fill plan" })).toBeVisible();

  const google = page.getByRole("region", { name: "Google Search ads" });
  await expect(google.getByText("Policy check passed")).toBeVisible();
  await expect(google.getByRole("button", { name: "Google Ads Editor file" })).toBeDisabled();
  const meta = page.getByRole("region", { name: "Facebook and Instagram ads" });
  await expect(meta.getByText("Policy check passed")).toBeVisible();
  await expect(meta.getByRole("button", { name: "Ads Manager spec" })).toBeDisabled();
  const site = page.getByRole("region", { name: "Your one-page website" });
  await expect(site.locator("iframe[title='Website preview']")).toHaveAttribute("sandbox", "");
  await expect(page.frameLocator("iframe[title='Website preview']").getByText("Dana Reyes, LCPC (fictional demo practice)")).toBeVisible();
  expect(await violations(page)).toEqual([]);

  // The website she downloads passes axe too, light and dark.
  const html = (await site.locator("iframe[title='Website preview']").getAttribute("srcdoc"))!;
  const own = await page.context().newPage();
  await own.setContent(html);
  expect(await violations(own)).toEqual([]);
  await own.close();

  // Queue the website, approve it, and the downloads unlock.
  await site.getByRole("button", { name: "Queue for approval" }).click();
  await expect(site.getByText("Waiting for your approval")).toBeVisible();
  await expect(site.getByRole("button", { name: "Website files (zip)" })).toBeDisabled();

  await page.goto("/approvals");
  const card = page.getByRole("listitem", { name: "[Sample] One-page website draft" });
  await card.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByRole("listitem", { name: "[Sample] One-page website draft" }).getByText("Done")).toBeVisible({ timeout: 15_000 });

  await page.goto("/media/grow");
  const ready = page.getByRole("region", { name: "Your one-page website" });
  await expect(ready.getByText("Approved, ready to download")).toBeVisible();
  const zip = ready.getByRole("link", { name: "Website files (zip)" });
  // Downloads answer only the app's own page; a bare request is refused.
  const href = (await zip.getAttribute("href"))!;
  expect((await page.request.get(href)).status()).toBe(403);
  const sameOrigin = { headers: { "sec-fetch-site": "same-origin" } };
  const res = await page.request.get(href, sameOrigin);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  const sq = await page.request.get((await ready.getByRole("link", { name: "Text for Squarespace" }).getAttribute("href"))!, sameOrigin);
  expect(await sq.text()).toContain("=== Fees and insurance ===");
  expect(await violations(page)).toEqual([]);
});
