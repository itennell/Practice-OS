import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-032 Settings controls: switch, select, radio choices, text input.

test.describe("Settings controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/ui-lab/settings");
    await expect(page.getByRole("switch", { name: "Morning brief" })).toBeVisible();
  });

  test("turning on auto-approve asks first; Cancel leaves it off", async ({ page }) => {
    const sw = page.getByRole("switch", { name: "Text callers their consult options" });
    await expect(sw).toHaveAccessibleDescription("Aeon sends open consult times by text without asking you first.");
    await sw.click();
    const dialog = page.getByRole("alertdialog", { name: "Let Aeon text callers without asking?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(sw).not.toBeChecked();
    await sw.click();
    await page.getByRole("button", { name: "Turn on auto-texting" }).click();
    await expect(sw).toBeChecked();
    await sw.click();
    await expect(sw).not.toBeChecked();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  });

  test("a plain switch toggles with the keyboard", async ({ page }) => {
    const sw = page.getByRole("switch", { name: "Morning brief" });
    await sw.focus();
    await page.keyboard.press("Space");
    await expect(sw).not.toBeChecked();
    await expect(page.getByRole("switch", { name: "Post to Instagram on its own" })).toBeDisabled();
  });

  test("the dropdown picks a value", async ({ page }) => {
    const trigger = page.getByRole("combobox", { name: "Remind me about deadlines" });
    await expect(trigger).toHaveText(/2 weeks before/);
    await trigger.click();
    await page.getByRole("option", { name: "1 month before" }).click();
    await expect(trigger).toHaveText(/1 month before/);
  });

  test("radio choices move with arrow keys", async ({ page }) => {
    const group = page.getByRole("radiogroup", { name: "How Aeon writes to you" });
    await group.getByRole("radio", { name: /Plain/ }).focus();
    await page.keyboard.press("ArrowDown");
    await expect(group.getByRole("radio", { name: /Brief/ })).toBeChecked();
  });

  test("a text box says what is wrong in words", async ({ page }) => {
    const phone = page.getByRole("textbox", { name: "Your own phone, for urgent alerts" });
    await phone.fill("555");
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(phone).toHaveAccessibleDescription(/Enter a 10-digit phone number/);
  });

  test("controls are big enough to tap and have a visible focus ring", async ({ page }) => {
    const row = page.getByRole("switch", { name: "Morning brief" });
    const hit = await row.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const after = getComputedStyle(el, "::before");
      return r.height - 2 * parseFloat(after.top || "0");
    });
    expect(hit).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement!).outlineStyle);
    expect(outline).toBe("solid");
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("settings.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
