import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Documents in the chat (lib/documents, lib/uploads). Isaiah's Oct 28 conversation is
// replayed from its recorded model replies (tests/fixtures/aeon-chat/show-documents.json),
// so no live model call. Files added here never need Muse: a client intake form is
// refused before any model, and a W-9's tax ID keeps it from the model.

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Isaiah's question gets document cards, not a request to upload", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts show-documents", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto(`/?c=${id}`);
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("can you pull up the documents here in the chat")).toBeVisible();
  await expect(log.getByText(/Found your documents/).first()).toBeVisible();
  await expect(log).not.toContainText("I can't pull the files");
  // Aeon's own words never ask her to send files in. (A missing W-9's card may say to upload it in CAQH.)
  for (const said of await log.locator("li").filter({ hasText: "Aeon said:" }).locator(".tile").allInnerTexts()) {
    expect(said).not.toMatch(/upload (it|them|the files?) (here|to me)|send (me|it) (the|a)? ?files?|can't (pull|show)/i);
  }

  const cards = log.getByRole("list", { name: /documents?$/ }).last();
  await expect(cards.getByRole("link", { name: /^Open / }).first()).toBeVisible();
  await expect(cards.getByRole("link", { name: /^Open BCBSIL application/ })).toHaveAttribute("href", /\/admin\?panel=insurance&back=/);
  await expect(cards.getByRole("link", { name: /^Open CAQH re-attestation checklist/ })).toBeVisible();
  for (const link of await cards.getByRole("link").all()) {
    const box = await link.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }

  expect(await axeViolations(page)).toEqual([]);
  // 200% zoom: the same page in half the CSS width and height.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: Math.round(size.width / 2), height: Math.round(size.height / 2) });
  expect(await axeViolations(page)).toEqual([]);
  await page.setViewportSize(size);

  // Open shows the side panel already filled in; closing it comes back to this chat.
  const open = cards.getByRole("link", { name: /^Open CAQH re-attestation checklist/ });
  if ((page.viewportSize()?.width ?? 0) >= 768) await open.click();
  // Phones: the row scrolls sideways under the pinned message box, where a synthetic click lands on
  // the box; follow the same link instead (a finger swipes the row first).
  else await page.goto((await open.getAttribute("href"))!);
  await expect(page.getByRole("dialog", { name: "Credentialing" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/\\?c=${id}$`));
});

test("A client intake form is refused in plain words and saved nowhere", async ({ page, request }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles({
    name: "intake.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("[Sample] New Client Intake Form\nClient name: ________\nDate of birth: ________\nPresenting problem: ________\n"),
  });
  await expect(page.getByText(/looks like a client record/)).toBeVisible();
  const { conversations } = await (await request.get("/api/conversations")).json();
  expect(conversations).toEqual([]);
});

test("A W-9 is kept on this computer and shows as a card", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator('input[type="file"]').setInputFiles({
    name: "w9.txt",
    mimeType: "text/plain",
    // A different file each run, so the duplicate check doesn't answer "already have it".
    buffer: Buffer.from(`Form W-9 Request for Taxpayer Identification Number and Certification\nName: Reyes Counseling PLLC [Sample]\nEmployer identification number: 00-1234567\nRun ${Date.now()}\n`),
  });
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("Added a document")).toBeVisible();
  await expect(log.getByText(/without sending it to Muse/)).toBeVisible();
  await expect(log.getByRole("link", { name: /^Open W-9/ })).toHaveAttribute("href", /^\/api\/documents\/[0-9a-f-]{36}\/file$/);
  expect(await axeViolations(page)).toEqual([]);
});
