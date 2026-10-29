import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import sharp from "sharp";

// The Instagram page with three [Sample] posts seeded straight into the
// database (no model calls): one waiting for her, one blocked, one live.
// The server runs with DRY_RUN, so approving checks the post and posts nothing.

async function seed() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const jpeg = await sharp(readFileSync("public/demo/dana-reyes-headshot.jpg"))
      .resize(1080, 1350, { fit: "cover" })
      .jpeg()
      .toBuffer();
    const [a] = await sql`
      insert into practice_os.approvals (kind, title, preview, payload, status, created_by, is_sample)
      values ('instagram_post', '[Sample] Instagram post: How to book', ${sql.json({ body: "Start with a free call." })}, '{}', 'pending', 'aeon:instagram', true)
      returning id`;
    const [p] = await sql`
      insert into practice_os.posts (topic, caption, headline, alt_text, image_jpeg, status, approval_id, week_of, is_sample)
      values ('how_to_book', ${"[Sample] Start with a free 15-minute call, then pick a time.\n\nDana Reyes, LCPC (fictional demo practice)"},
              '[Sample] How to book', 'Dana smiling beside the words How to book', ${jpeg}, 'pending_approval', ${a.id}, current_date, true)
      returning id`;
    await sql`update practice_os.approvals set payload = ${sql.json({ post_id: p.id })} where id = ${a.id}`;
    await sql`
      insert into practice_os.posts (topic, caption, headline, status, blocked_reason, week_of, is_sample)
      values ('first_session', '[Sample] A client of mine…', '[Sample] A client story', 'blocked',
              ${"Posts can't tell a client's story, even with details changed. That protects your clients and your license."}, current_date, true)`;
    await sql`
      insert into practice_os.posts (topic, caption, headline, alt_text, image_jpeg, status, ig_permalink, published_at, week_of, is_sample)
      values ('fees_superbills', ${"[Sample] Sessions are $175.\n\nDana Reyes, LCPC (fictional demo practice)"}, '[Sample] What a session costs',
              'Dana at her desk', ${jpeg}, 'published', 'https://www.instagram.com/p/SAMPLE123/', now(), current_date, true)`;
  } finally {
    await sql.end();
  }
}

test.beforeEach(async () => {
  execSync("npm run db:reset", { stdio: "ignore" });
  await seed();
});

async function axe(page: import("@playwright/test").Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

test("See the week's posts, why one was blocked, and approve one", async ({ page }) => {
  await page.goto("/instagram");
  await expect(page.getByRole("heading", { level: 1, name: "Instagram" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Plan this week" })).toBeVisible();
  await expect(page.getByText("1 waiting for you · 1 live")).toBeVisible();

  const blocked = page.getByRole("listitem").filter({ hasText: "A client story" });
  await expect(blocked).toContainText("Blocked");
  await expect(blocked).toContainText("can't tell a client's story");

  const live = page.getByRole("listitem").filter({ hasText: "What a session costs" });
  await expect(live.getByRole("link", { name: /View on Instagram/ })).toHaveAttribute("href", "https://www.instagram.com/p/SAMPLE123/");
  await expect(live.getByRole("img", { name: "Dana at her desk" })).toBeVisible();

  await axe(page);

  const waiting = page.getByRole("listitem").filter({ hasText: "[Sample] How to book" }).first();
  await waiting.getByText("Read the caption").click();
  await expect(waiting).toContainText("Dana Reyes, LCPC (fictional demo practice)");
  await waiting.getByRole("button", { name: "Approve" }).click();
  await expect(waiting.getByText("Done").first()).toBeVisible();
});

test("Keyboard reaches every action, and text at 200% still fits", async ({ page }) => {
  await page.goto("/instagram");
  await page.getByRole("button", { name: "Plan this week" }).focus();
  await expect(page.getByRole("button", { name: "Plan this week" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Or ask for one post")).toBeFocused();

  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await axe(page);
});
