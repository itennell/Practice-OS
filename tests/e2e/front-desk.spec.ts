import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// Front Desk page on the demo data ([Sample] callers): what needs her, the
// calls and texts, Up next, the phone and calendar Connect cards, the switches.
test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

const axe = async (page: import("@playwright/test").Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("Front Desk shows sample callers, filters, Up next and both Connect cards", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/front-desk");
  await expect(page.getByRole("heading", { name: "Front Desk", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByText("[Sample] Jordan Example asked whether you offer couples sessions.")).toBeVisible();
  await expect(page.getByText("[Sample] Sam Example").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(page.getByText(/FD-1001/)).toBeVisible();

  await page.getByRole("link", { name: "Booked" }).click();
  await expect(page).toHaveURL(/filter=booked/);
  await expect(page.getByRole("link", { name: "Booked" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("[Sample] Riley Example")).toHaveCount(0);

  const phone = page.getByRole("region", { name: "Practice phone" });
  await expect(phone.getByText("Spruce Health")).toBeVisible();
  await expect(phone.getByRole("button", { name: "Copy the message" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Connect" })).toBeDisabled();
  const cal = page.getByRole("region", { name: "Consult calendar" });
  await expect(cal.getByRole("radio", { name: /Cal\.com/ })).toBeChecked();
  await expect(cal.getByLabel("Cal.com API key")).toBeVisible();

  await expect(page.getByRole("switch", { name: "Book when a caller picks a time" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Text a reminder the day before" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a bad Spruce token gets a plain fix, read out as an alert", async ({ page }) => {
  await page.goto("/front-desk");
  const phone = page.getByRole("region", { name: "Practice phone" });
  await phone.getByLabel("Spruce token").fill("short");
  await phone.getByRole("button", { name: "Connect" }).click();
  await expect(phone.getByText(/too short/)).toBeVisible();
});

test("crisis alerts stay pinned first until she marks them seen", async ({ page, request }) => {
  await page.goto("/front-desk");
  const firstAlert = page.getByRole("region", { name: "Needs you" }).getByRole("listitem").first();
  await expect(firstAlert).toBeVisible();
  await firstAlert.getByRole("button", { name: /Done|I've seen this/ }).click();
  await expect(page.getByText("[Sample] Jordan Example asked whether you offer couples sessions.")).toHaveCount(0);
  expect((await request.get("/api/front-desk/check")).ok()).toBe(true);
});

test("works at 200% text with no sideways scrolling", async ({ page }) => {
  await page.goto("/front-desk");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Front Desk", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await axe(page)).toEqual([]);
});

test("Settings › Connections lists the phone and Cal.com cards after Google", async ({ page }) => {
  await page.goto("/settings/connections");
  await expect(page.getByRole("region", { name: "Cal.com" })).toBeVisible();
  const titles = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  const at = (t: string) => titles.indexOf(t);
  expect(at("Google")).toBeGreaterThanOrEqual(0);
  expect(at("Practice phone")).toBeGreaterThan(at("Google"));
  expect(at("Cal.com")).toBeGreaterThan(at("Practice phone"));
  await expect(page.getByRole("region", { name: "Practice phone" }).getByLabel("Spruce token")).toBeVisible();
  await expect(page.getByRole("region", { name: "Cal.com" }).getByLabel("Cal.com API key")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
