import { expect, type Page } from "@playwright/test";

// Referrals › Partners: open a partner's side panel from its row (the table on a wide
// screen, the stacked list on a phone) and close it again.

/** The partner's row: in the table on a wide screen, in the stacked list on a phone (only one is shown). */
export const partnerRow = (page: Page, name: string) => page.locator("tr, li").filter({ has: page.getByRole("button", { name: `Open ${name}`, exact: true }) });

/** Opens the partner's side panel and returns it. */
export async function openPartner(page: Page, name: string) {
  await page.getByRole("button", { name: `Open ${name}`, exact: true }).click();
  const panel = page.getByRole("dialog", { name, exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

export async function closePanel(page: Page) {
  await page.getByRole("button", { name: "Close panel" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}
