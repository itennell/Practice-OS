import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// The Instagram content coach in chat: "give me 3 post ideas for this week", then
// "draft the second one". The conversation is replayed from a recorded golden run
// (tests/fixtures/aeon-chat/content-coach.json, scripts/seed-chat.ts): the model's
// replies and the Muse calls inside the tools come from the recording, the tools run
// for real, and the picture is the plain stand-in (no image models in a test).

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

test("Three post ideas, then 'draft the second one': the draft waits for her OK in the chat and in Approvals", async ({ page }) => {
  test.setTimeout(180_000);
  execSync("npm run db:reset", { stdio: "ignore" });
  const id = execSync("npx tsx scripts/seed-chat.ts content-coach", { encoding: "utf8", env: { ...process.env, PLAYWRIGHT_IMAGE_STANDIN: "1", DRY_RUN: "true" } })
    .trim()
    .split("\n")
    .at(-1)!;

  await page.goto(`/?c=${id}`);
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("give me 3 post ideas for this week")).toBeVisible();
  await expect(log.getByText(/Came up with post ideas/).first()).toBeVisible();
  // Coach first: numbered ideas, each a hook with points, a call to action and a picture, marked [Sample] on the demo practice.
  await expect(log.getByText(/\[Sample\]/).first()).toBeVisible();
  await expect(log.getByText(/Call to action/).first()).toBeVisible();
  await expect(log.getByText("draft the second one")).toBeVisible();
  await expect(log.getByText(/Drafted the post/).first()).toBeVisible();

  const card = log.getByRole("listitem").filter({ has: page.getByRole("heading", { name: /Instagram post:/ }) }).last();
  await expect(card.getByText("Waiting for you", { exact: true })).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  await page.goto("/approvals");
  await expect(page.getByText(/Instagram post:/).first()).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);

  // Her latest ideas are listed on the Instagram page too.
  await page.goto("/instagram");
  const ideas = page.getByRole("region", { name: "Post ideas" });
  await expect(ideas.getByText(/^2\. \[Sample\]/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
});
