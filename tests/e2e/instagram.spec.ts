import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import sharp from "sharp";

// The Instagram page with three [Sample] posts seeded straight into the
// database (no model calls): one waiting for her, one blocked, one ready to post.
// Publishing is cut for now: approving marks a post ready, and she copies the
// caption and downloads the picture to post it herself.

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
      insert into practice_os.posts (topic, caption, headline, alt_text, image_jpeg, status, week_of, is_sample)
      values ('fees_superbills', ${"[Sample] Sessions are $175.\n\nDana Reyes, LCPC (fictional demo practice)"}, '[Sample] What a session costs',
              'Dana at her desk', ${jpeg}, 'ready', current_date, true)`;
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

test("Posts show as Instagram previews; approve one, then download its pictures", async ({ page }) => {
  await page.goto("/instagram");
  await expect(page.getByRole("heading", { level: 1, name: "Instagram" })).toBeVisible();
  // One box, two actions. The old five-post plan, Connect and "Read the caption" are gone.
  await expect(page.getByLabel("What should the post be about?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Write this post" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Plan several" })).toBeVisible();
  await expect(page.getByRole("slider", { name: "Posts" })).toHaveAttribute("aria-valuetext", "3 posts");
  await expect(page.getByRole("button", { name: "Plan this week" })).toHaveCount(0);
  await expect(page.getByText("Read the caption")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Connect Instagram/ })).toHaveCount(0);
  await expect(page.getByText("1 waiting for you · 1 ready to post")).toBeVisible();

  const blocked = page.getByRole("listitem").filter({ hasText: "A client story" });
  await expect(blocked).toContainText("Blocked");
  await expect(blocked).toContainText("can't tell a client's story");

  // The preview: profile row, picture, caption with "more".
  const waiting = page.getByRole("listitem").filter({ hasText: "[Sample] How to book" }).first();
  await expect(waiting.getByRole("img", { name: "Reyes Counseling PLLC" })).toBeVisible();
  await expect(waiting.getByRole("img", { name: "Dana smiling beside the words How to book" })).toBeVisible();
  await expect(waiting).not.toContainText("Dana Reyes, LCPC (fictional demo practice)");
  await waiting.getByRole("button", { name: "more of the caption" }).click();
  await expect(waiting).toContainText("Dana Reyes, LCPC (fictional demo practice)");

  const ready = page.getByRole("listitem").filter({ hasText: "What a session costs" }).first();
  await expect(ready.getByText("Ready to post").first()).toBeVisible();
  await expect(ready.getByRole("button", { name: "Copy caption" })).toBeVisible();
  for (const [name, w, h] of [
    [/Picture 4:5/, 1080, 1350],
    [/Square picture/, 1080, 1080],
  ] as const) {
    const [file] = await Promise.all([page.waitForEvent("download"), ready.getByRole("link", { name }).click()]);
    expect(file.suggestedFilename()).toMatch(/^instagram-post-.*\.jpg$/);
    const meta = await sharp(readFileSync(await file.path())).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["jpeg", w, h]);
  }
  await expect(ready.getByRole("listitem").filter({ hasText: "Open the Instagram app" })).toBeVisible();

  await axe(page);

  await waiting.getByRole("button", { name: "Approve" }).click();
  // Approving never posts: the post is now ready for her to post herself.
  await expect(page.getByText("0 waiting for you · 2 ready to post")).toBeVisible();
  const approved = page.getByRole("listitem").filter({ hasText: "[Sample] How to book" }).first();
  await expect(approved.getByRole("button", { name: "Copy caption" })).toBeVisible();
});

test("An advice topic is explained and the nearest logistics post is offered", async ({ page }) => {
  await page.goto("/instagram");
  await page.getByLabel("What should the post be about?").fill("how to work through anxiety");
  await page.getByRole("button", { name: "Write this post" }).click();
  await expect(page.getByText("Posts stay on how your practice works, so Aeon can't write advice about anxiety.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Write “What a first session for anxiety looks like”" })).toBeVisible();
  // Nothing was written.
  await expect(page.getByText("1 waiting for you · 1 ready to post")).toBeVisible();
  await page.getByRole("button", { name: "Write something else" }).click();
  await expect(page.getByText(/so Aeon can't write advice/)).toHaveCount(0);
  await axe(page);
});

test("Research first: a short summary and angles with their links, then she picks one", async ({ page }) => {
  await page.goto("/instagram");
  await page.getByLabel("What should the post be about?").fill("what to bring to a first session");
  await page.getByRole("button", { name: "Plan several" }).click();
  const panel = page.getByRole("region", { name: "What other therapists post about this" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Therapists keep these posts plain");
  const angles = panel.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3 }) });
  await expect(angles).toHaveCount(2);
  await expect(angles.first()).toContainText("Nervous about a first session?");
  const links = angles.first().getByRole("list", { name: "Sources" }).getByRole("link");
  await expect(links.first()).toHaveAttribute("href", /^https:\/\/example\.com\//);
  await expect(links.first()).toHaveAttribute("target", "_blank");
  await expect(panel.getByRole("link", { name: /instagram\.com/ })).toHaveCount(0);
  await expect(angles.first().getByRole("button", { name: "Plan 3 from this: What your first session looks like" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Plan them as I typed it" })).toBeVisible();
  await axe(page);
});

test("Keyboard reaches every action, and text at 200% still fits", async ({ page }) => {
  await page.goto("/instagram");
  await page.getByLabel("What should the post be about?").fill("how superbills work");
  await page.getByLabel("What should the post be about?").focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Write this post" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("slider", { name: "Posts" })).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("slider", { name: "Posts" })).toHaveAttribute("aria-valuetext", "2 posts");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Plan several" })).toBeFocused();

  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await axe(page);
});
