import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// The chat-first studio on Media > Instagram, with the studio stand-ins
// (PLAYWRIGHT_STUDIO_STANDIN=1: fixed model answers, a plain background, the
// research stand-in's example links). Chat edits and canvas edits are the same
// operations; Undo puts the canvas back exactly.

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function axe(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  expect(results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const chat = (page: Page) => page.getByRole("region", { name: "Chat with Aeon about your post" });
const canvas = (page: Page) => page.getByRole("region", { name: /How booking works/ });

async function say(page: Page, text: string) {
  const box = chat(page).getByRole("textbox", { name: "Tell Aeon what to make or change" });
  await box.fill(text);
  await box.press("Enter");
}

async function makeReel(page: Page) {
  await page.goto("/media/instagram");
  await say(page, "make a reel about how booking works");
  // Live progress while Aeon works, then the canvas.
  await expect(chat(page).getByText("Looking at what therapists post")).toBeVisible();
  await expect(page.getByTestId("canvas-title")).toHaveText("[Sample] How booking works", { timeout: 60_000 });
  await expect(page.getByTestId("slide-card")).toHaveCount(4);
}

const slideWords = (page: Page, n: number) => canvas(page).getByRole("button", { name: new RegExp(`^Slide ${n} words: `) });

test("Make a reel in chat, change it in chat, Undo puts it back, Redo again", async ({ page }) => {
  test.setTimeout(120_000);
  await makeReel(page);
  // Research shows in the chat with the other angle to try.
  await expect(chat(page).getByText(/I went with/)).toBeVisible();
  const before = await slideWords(page, 2).getAttribute("aria-label");
  expect(before).toContain("Pick a time that works for you on the booking page");

  await say(page, "make slide 2 shorter");
  await expect(chat(page).getByText("Slide 2 is shorter.")).toBeVisible();
  const after = await slideWords(page, 2).getAttribute("aria-label");
  expect(after!.length).toBeLessThan(before!.length);

  await canvas(page).getByRole("button", { name: "Undo" }).click();
  await expect(slideWords(page, 2)).toHaveAttribute("aria-label", before!);
  await canvas(page).getByRole("button", { name: "Redo" }).click();
  await expect(slideWords(page, 2)).toHaveAttribute("aria-label", after!);

  // The version list shows both steps; going back to 0 restores how Aeon made it.
  await canvas(page).getByRole("button", { name: "Versions" }).click();
  await expect(canvas(page).getByRole("button", { name: /1\. Shortened slide 2 · from chat/ })).toBeVisible();
  await canvas(page).getByRole("button", { name: /0\. How Aeon first made it/ }).click();
  await expect(slideWords(page, 2)).toHaveAttribute("aria-label", before!);
});

test("Change it by hand: click words to edit, move a slide, warmer colours; all undoable", async ({ page }) => {
  test.setTimeout(120_000);
  await makeReel(page);
  await slideWords(page, 3).click();
  const box = canvas(page).getByRole("textbox", { name: "Slide 3 words" });
  await box.fill("A free 15-minute call comes first");
  await box.press("Enter");
  await expect(slideWords(page, 3)).toHaveAttribute("aria-label", /A free 15-minute call comes first/);
  await canvas(page).getByRole("button", { name: "Move slide 3 left" }).click();
  await expect(slideWords(page, 2)).toHaveAttribute("aria-label", /A free 15-minute call comes first/);
  await canvas(page).getByRole("button", { name: "Warm" }).click();
  await expect(canvas(page).getByRole("button", { name: "Warm" })).toHaveAttribute("aria-pressed", "true");
  // Advice typed on the canvas is refused in plain words, and nothing changes.
  await slideWords(page, 3).click();
  const tip = canvas(page).getByRole("textbox", { name: "Slide 3 words" });
  await tip.fill("Try box breathing to calm anxiety");
  await tip.press("Enter");
  await expect(chat(page).getByText(/I didn't change it/)).toBeVisible();
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(canvas(page).getByRole("button", { name: "Calm" })).toHaveAttribute("aria-pressed", "true");
});

test("Approve it, then the big download and copy buttons and how to post it", async ({ page }) => {
  test.setTimeout(120_000);
  await makeReel(page);
  await canvas(page).getByRole("button", { name: "Approve" }).click();
  const finished = page.getByTestId("finished");
  await expect(finished).toBeVisible({ timeout: 30_000 });
  await expect(finished.getByRole("button", { name: "Copy caption" })).toBeVisible();
  await expect(finished.getByRole("button", { name: "Download video" })).toBeVisible();
  await expect(finished.getByRole("heading", { name: "How to post it" })).toBeVisible();
  await axe(page);
});

test("An advice topic gets the plain reason and logistics angles, never an error", async ({ page }) => {
  await page.goto("/media/instagram");
  await say(page, "make a post about how to cope with depression");
  await expect(page.getByTestId("redirect-why")).toContainText("Posts stay on how your practice works");
  const angles = page.getByTestId("redirect-angles").getByRole("button");
  await expect(angles.first()).toHaveText(/depression/);
  expect(await angles.count()).toBeGreaterThanOrEqual(2);
  await expect(chat(page).getByRole("alert")).toHaveCount(0);
});

test("The studio passes axe in light and dark", async ({ page }) => {
  test.setTimeout(120_000);
  await makeReel(page);
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await axe(page);
  }
});
