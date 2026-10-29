import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Onboarding's marketing interview (chapter 6) for three fictional therapists, each on
// her own path: one posts weekly, one has no Instagram but wants one, and one says
// Instagram isn't for her. Chapters 1-5 are answered through the app's own API so each
// run starts at "How do new clients find you now?"; every chapter 6 screen is checked
// with axe. No Muse key here, so the style screen shows the three fixed [Sample] captions.

const FRESH = ["clinician_profile", "compliance_facts", "settings", "credentialing_profile", "payer_applications", "obligations", "memories", "referral_settings"];

function freshInstall() {
  execSync("npm run db:reset", { stdio: "ignore" });
  execSync(
    `node -e "const p=require('postgres')(process.env.DATABASE_URL);p.unsafe('truncate ${FRESH.map((t) => `practice_os.${t}`).join(", ")} cascade').then(()=>process.exit(0))"`,
    { stdio: "ignore" },
  );
}

async function seriousViolations(page: Page) {
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.playState === "running" && Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((done) => setTimeout(done, 1500)),
    ]),
  );
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const next = (page: Page) => page.getByRole("button", { name: /^(Next|Finish setup)$/ });
const radio = (page: Page, name: string | RegExp) => page.getByRole("radio", { name }).click();
const chip = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).click();

/** Answer the current screen, check it with axe, then press Next (or Skip / Set up later). */
async function step(page: Page, ask: RegExp, fill: () => Promise<void>, how: "next" | "skip" | "later" = "next") {
  await expect(heading(page)).toHaveText(ask);
  await fill();
  expect(await seriousViolations(page), `axe on "${ask}"`).toEqual([]);
  await (how === "next" ? next(page) : page.getByRole("button", { name: how === "skip" ? "Skip" : "Set up later" })).click();
  await expect(heading(page)).not.toHaveText(ask, { timeout: 20_000 });
}

/** A new therapist's chapters 1-5, saved the way the screens save them, then chapter 6 opens. */
async function startAtChapter6(page: Page, name: string, stage: "beginning" | "middle" | "late") {
  freshInstall();
  await page.goto("/onboarding");
  await page.evaluate(
    async ({ name, stage }) => {
      const post = (answers: Record<string, unknown>) =>
        fetch("/api/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers }) }).then((r) => r.json());
      await post({ name, practice_name: `${name} Counseling (fictional)`, state: "IL", license: "LCSW" });
      await post({ stage });
    },
    { name, stage },
  );
  await page.goto("/onboarding?q=find_clients");
  await expect(page.getByText(/Connect your tools · question 1 of/)).toBeVisible();
}

/** Skip whatever is left in chapters 6 and 7, finish on the team screen, and list every question seen. */
async function finishFromHere(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < 20; i++) {
    const ask = (await heading(page).textContent()) ?? "";
    seen.push(ask);
    expect(await seriousViolations(page), `axe on "${ask}"`).toEqual([]);
    if (ask === "Meet your team") break;
    if (ask === "Connect your tools") await next(page).click();
    else await page.getByRole("button", { name: "Skip" }).click();
    await expect(heading(page)).not.toHaveText(ask, { timeout: 20_000 });
  }
  return seen;
}

test.describe.configure({ timeout: 240_000 });

/** On phones the chat menu is a panel she opens; the same list comes from /api/menu. */
const wide = () => !test.info().project.name.startsWith("phone");
const menuHidden = (page: Page) => page.evaluate(() => fetch("/api/menu").then((r) => r.json()).then((d: { hidden: string[] }) => d.hidden));

test("Maya posts weekly: she has an Instagram, connects it later, and picks her style", async ({ page }) => {
  await startAtChapter6(page, "Maya Ortiz", "middle");
  await step(page, /How do new clients find you now\?/, async () => {
    await chip(page, "Word of mouth");
    await chip(page, "Instagram or other social media");
  });
  await step(page, /Do you have an Instagram for your practice\?/, () => radio(page, "Yes, I have one"));
  await step(page, /Do you want to connect it now\?/, async () => {
    await radio(page, "Connect now");
    await expect(page.locator("main").getByText(/Instagram/).first()).toBeVisible(); // the Settings › Connections card, inline
    await radio(page, "Later");
  });
  await step(page, /What should your posts help with\?/, () => chip(page, "Fill my open spots"));
  await step(page, /What should your posts be about\?/, async () => {
    await expect(page.getByText(/Posts won't cover: advice about mental health, client stories, or reviews from clients\./)).toBeVisible();
    await page.getByRole("button", { name: "Office and telehealth", pressed: true }).click();
  });
  await step(page, /How often do you want to post\?/, () => radio(page, "Once a week"));
  await step(page, /What should posts never show\?/, () => chip(page, "My family"));
  await step(page, /Which one sounds most like you\?/, async () => {
    await expect(page.getByText(/\[Sample\]/)).toHaveCount(3);
    await radio(page, /Warm/);
  });
  await step(page, /Do you have a website for your practice\?/, () => radio(page, "No, a website isn't for me"));
  const rest = await finishFromHere(page);
  expect(rest).not.toContain("What is your website address?");
  await expect(page.getByRole("switch", { name: /Instagram/ })).toBeChecked();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/);

  await expect(page.getByRole("region", { name: "Still to set up" })).toContainText("Connect Instagram");
  expect(await menuHidden(page)).toEqual([]);
  if (wide()) await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Instagram" })).toBeVisible();
  const saved = await page.evaluate(() => fetch("/api/onboarding").then((r) => r.json()));
  expect(saved.saved).toMatchObject({ "instagram:posts_per_week": "1", "instagram:never_show": ["family"], "instagram:style": { pick: "warm" } });
});

test("Theo has no Instagram but wants one: he gets the steps, and his website is asked straight away", async ({ page }) => {
  await startAtChapter6(page, "Theo Grant", "beginning");
  await step(page, /How do new clients find you now\?/, async () => {
    await chip(page, "Doctors who send people to me");
    await chip(page, "My website");
  });
  await step(page, /Do you have an Instagram for your practice\?/, () => radio(page, "No, but I'd like one"));
  await step(page, /How to make a business account/, async () => {
    await expect(page.getByRole("listitem").filter({ hasText: "Switch to a professional account" })).toBeVisible();
    await radio(page, "I'll do it later");
  });
  await step(page, /What should your posts help with\?/, () => chip(page, "Explain my fees and insurance"));
  await step(page, /What should your posts be about\?/, async () => {});
  await step(page, /How often do you want to post\?/, () => radio(page, "3 times a week"));
  await step(page, /What should posts never show\?/, async () => {
    await chip(page, "My face");
    await chip(page, "None of these, all are okay"); // clears "My face"
    await expect(page.getByRole("button", { name: "My face", exact: true })).toHaveAttribute("aria-pressed", "false");
  });
  await step(page, /Which one sounds most like you\?/, () => page.getByLabel(/Or paste a post or bio you like/).fill("New clients welcome. Book a free call from the link in my bio."));
  await step(page, /What is your website address\?/, () => page.getByLabel("Website address").fill("grantcounseling.example.com"));
  await finishFromHere(page);
  // Doctors send him clients, so Referrals starts on even though he's just opening.
  await expect(page.getByRole("switch", { name: /Referrals/ })).toBeChecked();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("region", { name: "Still to set up" })).toContainText("Make an Instagram business account");
});

test("Rosa says Instagram isn't for her: no Instagram questions or reminders, ever", async ({ page }) => {
  await startAtChapter6(page, "Rosa Lin", "middle");
  await step(page, /How do new clients find you now\?/, () => chip(page, "Insurance company lists"));
  await step(page, /Do you have an Instagram for your practice\?/, () => radio(page, "No, Instagram isn't for me"));
  // Straight to her website: every other Instagram screen is gone.
  await step(page, /Do you have a website for your practice\?/, () => radio(page, "No, but I'd like one"));
  await expect(heading(page)).toHaveText("Connect your tools");
  await expect(page.getByText(/Instagram/)).toHaveCount(0); // no Instagram card
  const rest = await finishFromHere(page);
  expect(rest.filter((ask) => /Instagram|post/i.test(ask))).toEqual([]);
  await expect(page.getByRole("switch", { name: /Instagram/ })).not.toBeChecked();
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/);

  const todo = page.getByRole("region", { name: "Still to set up" });
  await expect(todo).toContainText("Make a practice website");
  await expect(todo).not.toContainText(/Instagram/);
  expect(await menuHidden(page)).toEqual(["/instagram"]); // the chat menu leaves Instagram out
  if (wide()) {
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Instagram" })).toHaveCount(0);
  }
  expect(await seriousViolations(page)).toEqual([]);
  // Coming back to onboarding later still shows no Instagram questions after her answer.
  const state = await page.evaluate(() => fetch("/api/onboarding").then((r) => r.json()));
  expect((state.screens as { id: string }[]).filter((s) => s.id.startsWith("instagram:")).map((s) => s.id)).toEqual(["instagram:account"]);
});
