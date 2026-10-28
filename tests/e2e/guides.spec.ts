import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("A deadline's 'How do I do this?' opens its guide, with her steps marked", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin/deadlines");
  await page
    .getByRole("listitem", { name: "CAQH re-attestation (Illinois: every 180 days)" })
    .getByRole("link", { name: "How do I do this?" })
    .click();
  await expect(page).toHaveURL(/\/admin\/how-do-i\/caqh-reattestation$/);
  await expect(page.getByRole("heading", { level: 1, name: "Re-attest on CAQH ProView" })).toBeVisible();
  await expect(page.getByText("You do this").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "proview.caqh.org" })).toHaveAttribute("href", "https://proview.caqh.org/pr");
  expect(errors).toEqual([]);
});

test("The guide list links to all five guides; an unknown guide shows not found", async ({ page }) => {
  await page.goto("/admin/how-do-i");
  for (const name of [
    "Form (and keep up) an Illinois PLLC",
    "Type 1 vs Type 2 NPI",
    "Re-attest on CAQH ProView",
    "Enroll in Medicare through PECOS",
    "Enroll in Illinois Medicaid (IMPACT)",
  ]) {
    await expect(page.getByRole("link", { name: new RegExp(name.replace(/[()]/g, "\\$&")) })).toBeVisible();
  }
  // notFound() inside a streamed Suspense boundary renders the not-found page (status stays 200 by design).
  await page.goto("/admin/how-do-i/not-a-guide");
  await expect(page.getByText(/could not be found/i)).toBeVisible();
});

for (const path of ["/admin/how-do-i", "/admin/how-do-i/illinois-pllc", "/admin/how-do-i/medicare-pecos"]) {
  test(`No serious accessibility issues on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}

test("Screenshot of a guide", async ({ page }, info) => {
  await page.goto("/admin/how-do-i/illinois-pllc");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `test/screens/guide-${info.project.name}.png`, fullPage: true });
});
