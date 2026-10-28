import { expect, type Locator, type Page } from "@playwright/test";

// The app's dropdowns and date boxes are shared components (SettingSelect, DateField),
// not native <select> or <input type="date">, so tests drive them the way a person does.

/** Open a SettingSelect by its label and pick an option by its visible text. */
export async function pick(page: Page, scope: Page | Locator, label: string | RegExp, option: string | RegExp) {
  const trigger = scope.getByRole("combobox", { name: label });
  await trigger.click();
  await page.getByRole("option", { name: option }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

/** Type an ISO day ("2026-11-25") into a DateField; it shows as 11/25/2026. */
export async function typeDate(scope: Page | Locator, label: string | RegExp, iso: string, opts: { nth?: number } = {}) {
  // Exact, so the field's own "Pick … from a calendar" button doesn't match too.
  const all = scope.getByLabel(label, { exact: typeof label === "string" });
  const box = opts.nth === undefined ? all : all.nth(opts.nth);
  await box.fill(iso ? iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1") : "");
  await box.blur();
}

/** "2026-11-25" as the Date field shows it. */
export const shown = (iso: string) => iso.replace(/^(\d{4})-(\d{2})-(\d{2})$/, "$2/$3/$1");
