import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Chat with Aeon at /. No live model call: the guards answer before any model,
// and a model-backed conversation is replayed from a recorded fixture into the
// database first (scripts/seed-chat.ts).

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

async function send(page: Page, text: string) {
  const box = page.getByRole("textbox", { name: "Message Aeon" });
  await box.fill(text);
  await box.press("Enter");
}

test("Opens on Aeon with suggestions, this week's brief and what's waiting", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /How can I help\?/ })).toBeVisible();
  const suggestions = page.getByRole("list", { name: "Suggestions" }).getByRole("button");
  await expect(suggestions).toHaveText(["What needs me this week?", "Draft a Good Faith Estimate", "Get me ready for CAQH"]);
  await expect(page.getByRole("heading", { name: /This week/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Waiting for you/ })).toBeVisible();
  await expect(page.getByText(/not clinical advice/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});

test("A crisis message gets the fixed 988 reply and is saved nowhere", async ({ page, request }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await send(page, "I don't want to be here anymore");
  const alert = page.getByRole("alert").filter({ hasText: "988" });
  await expect(alert).toContainText("911");
  await expect(page.getByText("I don't want to be here anymore", { exact: true })).toHaveCount(0);
  const { conversations } = await (await request.get("/api/conversations")).json();
  expect(conversations).toEqual([]);
});

test("A client name and birth date are refused, never shown, and stay in the box to fix", async ({ page, request }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const text = "My client Maria Lopez, DOB 3/14/1988, wants Tuesdays";
  await send(page, text);
  await expect(page.getByText("Not sent: privacy check")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Message Aeon" })).toHaveValue(text);
  await expect(page.getByRole("log").getByText("Maria")).toHaveCount(0);
  const { conversations } = await (await request.get("/api/conversations")).json();
  expect(conversations).toEqual([]);
});

test("A saved chat shows what Aeon checked and the approval card, the same row as Approvals", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts draft-gfe", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto(`/?c=${id}`);
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText(/Draft a Good Faith Estimate/).first()).toBeVisible();
  await expect(page.getByRole("list", { name: "What Aeon checked" }).getByText(/Drafted a Good Faith Estimate/)).toBeVisible();
  // The approval card is the innermost list item holding the estimate's heading.
  const card = log.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /GFE-2026-\d{4}/ }) }).last();
  await expect(card.getByText("Waiting for you", { exact: true })).toBeVisible();
  await expect(card.getByText(/from your chat with Aeon/)).toBeVisible();
  // On phones the chat list opens from the "Your chats" button.
  const toggle = page.getByRole("button", { name: /Your chats/ });
  if (await toggle.isVisible()) await toggle.click();
  await expect(page.getByRole("navigation", { name: "Your chats with Aeon" }).getByRole("link").first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await card.getByRole("button", { name: "Decline" }).click();
  await expect(card.getByText("Declined")).toBeVisible();
  await page.goto("/approvals");
  await expect(page.getByText(/GFE-2026-\d{4}/).first()).toBeVisible();
});
