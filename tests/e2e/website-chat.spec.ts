import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";

// The practice website chat: AI disclosure before anything is typed, typing
// only, consult times shown only after she approves them, crisis reply fixed.
test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

const axe = async (page: import("@playwright/test").Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("[data-sonner-toaster]").analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("a visitor asks to book; no sample times appear without a connected calendar", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/website-chat");
  const log = page.getByRole("log", { name: "Chat messages" });
  await expect(log).toContainText("I'm the AI assistant for");
  await expect(page.getByRole("button", { name: /microphone|dictat/i })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);

  await page.getByRole("textbox", { name: "Your message" }).fill("Hi, I'd like to book a consult");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(log).toContainText("can't check the calendar right now");
  await expect(log).not.toContainText("Open consult times");

  // No stand-in times or approval may be created for a real visitor.
  const admin = await context.newPage();
  await admin.goto("/approvals");
  await expect(admin.getByRole("listitem", { name: /Show a website visitor .* consult time/ })).toHaveCount(0);
  expect(await axe(page)).toEqual([]);

  // On Front Desk the chat is in the Inbox, under its own filter.
  await admin.goto("/front-desk?filter=web_chat");
  await expect(admin.getByTestId("inbox-row").filter({ hasText: "I'd like to book a consult" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a crisis message gets the fixed 988 reply", async ({ page }) => {
  await page.goto("/website-chat");
  await page.getByRole("textbox", { name: "Your message" }).fill("I don't want to live anymore");
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("log", { name: "Chat messages" })).toContainText("call or text 988 (Suicide & Crisis Lifeline) now");
});
