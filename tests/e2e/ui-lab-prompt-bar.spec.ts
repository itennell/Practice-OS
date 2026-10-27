import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// UI-011 Prompt Bar with UI-015 Voice Pill. Chrome's fake microphone stands in
// for a real one, and the transcription reply is stubbed so tests cost nothing.
test.use({
  permissions: ["microphone"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

test.describe("Prompt Bar", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/transcribe", (route) => route.fulfill({ json: { text: "Draft a referral letter to Lakeview" } }));
    await page.goto("/ui-lab/prompt-bar");
    await expect(page.getByRole("textbox", { name: "Message Aeon" })).toBeVisible();
  });

  test("Enter sends, Shift+Enter adds a line, and send turns into Stop while Aeon works", async ({ page }) => {
    const box = page.getByRole("textbox", { name: "Message Aeon" });
    await expect(page.getByRole("button", { name: "Send" }).first()).toBeDisabled();
    await box.fill("What's due this month?");
    await box.press("Shift+Enter");
    await box.pressSequentially("And next month?");
    await expect(box).toHaveValue("What's due this month?\nAnd next month?");
    await box.press("Enter");
    await expect(page.getByRole("list", { name: "Sent messages" })).toContainText("What's due this month?");
    await expect(box).toHaveValue("");
    const stop = page.getByRole("button", { name: "Stop" });
    await expect(stop).toBeVisible();
    await stop.click();
    await expect(page.getByRole("button", { name: "Send" }).first()).toBeVisible();
  });

  test("dictation: tap to record, tap to stop, words land in the box and are not sent", async ({ page }) => {
    const mic = page.getByRole("button", { name: "Dictate" });
    await mic.click();
    const stop = page.getByRole("button", { name: "Stop and turn into text" });
    await expect(stop).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("button", { name: "Cancel recording" })).toBeVisible();
    await page.waitForTimeout(1200);
    await stop.click();
    await expect(page.getByRole("textbox", { name: "Message Aeon" })).toHaveValue("Draft a referral letter to Lakeview", { timeout: 8_000 });
    await expect(page.getByRole("list", { name: "Sent messages" })).not.toContainText("Draft a referral letter");
  });

  test("Escape or Cancel throws the recording away without calling transcription", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/transcribe", (route) => {
      calls++;
      return route.fulfill({ json: { text: "should not appear" } });
    });
    await page.getByRole("button", { name: "Dictate" }).click();
    await expect(page.getByRole("button", { name: "Cancel recording" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Dictate" })).toBeVisible();
    await page.getByRole("button", { name: "Dictate" }).click();
    await page.getByRole("button", { name: "Cancel recording" }).click();
    await page.waitForTimeout(800);
    expect(calls).toBe(0);
    await expect(page.getByRole("textbox", { name: "Message Aeon" })).toHaveValue("");
  });

  test("a transcription failure is said in words", async ({ page }) => {
    await page.route("**/api/transcribe", (route) =>
      route.fulfill({ status: 502, json: { error: "Couldn't turn that recording into text. Try again, or type it." } }),
    );
    await page.getByRole("button", { name: "Dictate" }).click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "Stop and turn into text" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Couldn't turn" })).toContainText("Couldn't turn that recording into text", {
      timeout: 8_000,
    });
  });

  test("the public website chat has no mic", async ({ page }) => {
    await expect(page.getByRole("textbox", { name: "Message the practice" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Dictate" })).toHaveCount(1);
  });

  test("attach adds a file card above the text", async ({ page }) => {
    await page.getByRole("button", { name: "Add photos or files" }).click();
    await expect(page.getByRole("list", { name: "Files to send" }).getByRole("listitem")).toHaveCount(1);
  });

  test("typing shows one focus ring round the whole bar", async ({ page }) => {
    const box = page.getByRole("textbox", { name: "Message Aeon" });
    await box.focus();
    expect(await box.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("none");
    expect(await box.evaluate((el) => getComputedStyle(el.closest("form")!).outlineStyle)).toBe("solid");
  });

  test("has no serious or critical accessibility issues", async ({ page }) => {
    await page.getByRole("textbox", { name: "Message Aeon" }).fill("What's due this month?");
    const { violations } = await new AxeBuilder({ page }).analyze();
    const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(bad.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await expect(page).toHaveScreenshot("prompt-bar.png", { fullPage: true, maxDiffPixelRatio: 0.01, mask: [page.locator("nextjs-portal")] });
  });
});
