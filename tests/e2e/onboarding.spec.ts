import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick, typeDate } from "../helpers/controls";

// Aeon's onboarding interview on a fresh install: every screen checked with axe, a full
// run as a new clinician (answers, Skip and Set up later), the crisis reply, resuming,
// and the 200% / 320px reflow checks. No model call: without a Muse key the follow-up
// questions are the three fixed ones.

// Helper answers live here too (referral_settings; Instagram's in the profile, Front
// Desk's on settings), so each project starts from a truly fresh install.
const FRESH = ["clinician_profile", "compliance_facts", "settings", "credentialing_profile", "payer_applications", "obligations", "memories", "referral_settings"];

function freshInstall() {
  execSync("npm run db:reset", { stdio: "ignore" });
  execSync(
    `node -e "const p=require('postgres')(process.env.DATABASE_URL);p.unsafe('truncate ${FRESH.map((t) => `practice_os.${t}`).join(", ")} cascade').then(()=>process.exit(0))"`,
    { stdio: "ignore" },
  );
}

async function seriousViolations(page: Page) {
  // Let colour transitions (a chip just tapped) finish, so axe reads the settled colours.
  // Endless animations (Aeon breathing, Liquid Ether) never finish, so they're left out.
  // Only running ones (a paused animation never finishes), and never longer than 1.5s.
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
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const next = (page: Page) => page.getByRole("button", { name: /^(Next|Finish setup)$/ });

/** Answer the current screen with `fill`, check it with axe, then press Next (or Skip / Set up later). */
async function step(page: Page, ask: RegExp, fill: () => Promise<void>, how: "next" | "skip" | "later" = "next") {
  await expect(heading(page)).toHaveText(ask);
  await fill();
  expect(await seriousViolations(page), `axe on "${ask}"`).toEqual([]);
  const button = how === "next" ? next(page) : page.getByRole("button", { name: how === "skip" ? "Skip" : "Set up later" });
  await button.click();
  await expect(heading(page)).not.toHaveText(ask, { timeout: 20_000 }); // the client-detail guard runs a local model
}

const radio = (page: Page, name: string | RegExp) => page.getByRole("radio", { name }).click();
const none = async () => {};



test("A new clinician sets up the whole practice, and the home page lists what she put off", async ({ page }) => {
  test.setTimeout(240_000);
  freshInstall();
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("You and your practice · question 1 of 9")).toBeVisible();

  await step(page, /What's your name\?/, () => page.getByLabel("Your name").fill("Dana Reyes"));
  // No Muse key here, so desktop-app's Connect Aeon step shows; she puts it off.
  await step(page, /Connect Aeon's brain/, none, "later");
  await step(page, /What's your practice called\?/, () => page.getByLabel("Practice name").fill("Reyes Counseling PLLC"));
  await step(page, /Which state/, () => pick(page, page, "State", "Illinois"));
  await step(page, /What kind of license/, () => radio(page, /LCPC/));
  await step(page, /How do clients reach/, async () => {
    await page.getByLabel("Practice email").fill("dana@example.com");
    await page.getByLabel("Phone number clients call").fill("(312) 555-0100");
  });
  await step(page, /Where do you see clients\?/, () => radio(page, "Both"));
  await step(page, /office address/, async () => {
    await page.getByLabel("Street address").fill("100 W Example St");
    await page.getByLabel("City").fill("Chicago");
    await page.getByLabel("ZIP code").fill("60614");
  });
  await step(page, /your own cell phone/, () => page.getByLabel("Phone number").fill("312 555 0199"));

  // 2 · License and rules
  await expect(page.getByText(/License and rules · question 1 of/)).toBeVisible();
  await step(page, /When does your LCPC license expire\?/, () => typeDate(page, "Date", "2027-11-30"));
  await step(page, /first time renewing/, async () => {
    await radio(page, "No");
    await page.getByLabel(/Hours of continuing education/).fill("12");
  });
  await step(page, /26 or older/, () => radio(page, "Yes"));
  await step(page, /NPI/, none, "later");
  await step(page, /PLLC or LLC/, async () => {
    await radio(page, "Yes");
    await typeDate(page, "When was it formed?", "2026-01-15");
  });
  await step(page, /file taxes/, () => radio(page, /Just me/));
  await step(page, /tax ID/, none, "later");
  await step(page, /Does anyone work for you\?/, () => radio(page, "No"));
  await step(page, /malpractice/, none, "skip");
  await step(page, /Which of these do you already have\?/, async () => {
    await page.getByRole("radiogroup").first().getByRole("radio", { name: "I have this" }).click();
  });

  // 3 · Fees, insurance and hours
  await step(page, /Which days is your practice open\?/, none);
  await step(page, /What do you charge/, () => page.getByLabel(/Fee for Session, 53 minutes or more/).fill("175"));
  await step(page, /Do you take insurance\?/, () => radio(page, /clients pay me themselves/));
  await step(page, /set up with Medicare/, () => radio(page, "No"));

  // 4 · Who you help (the crisis check runs on what she types)
  await expect(heading(page)).toHaveText(/Who do you help/);
  await page.getByRole("button", { name: "Adults", exact: true, pressed: false }).click();
  await page.getByLabel("In your own words (optional)").fill("I want to kill myself");
  await next(page).click();
  await expect(page.getByRole("alert").filter({ hasText: "988" })).toBeVisible();
  await expect(heading(page)).toHaveText(/Who do you help/); // nothing saved, still here
  await page.getByLabel("In your own words (optional)").fill("Adults with work stress");
  await step(page, /Who do you help/, () => page.getByRole("button", { name: "Evenings", pressed: false }).click());

  // Three fixed follow-up questions (no Muse key here), one per screen.
  await step(page, /off your plate/, () => page.getByLabel("Your answer").fill("Insurance paperwork"));
  await step(page, /new clients would you like each month/, () => page.getByLabel("Your answer").fill("About four"));
  await step(page, /never want consults booked/, () => page.getByLabel("Your answer").fill("Fridays"));

  // 5 · Stage, 6 · Connect your tools, 7 · How Aeon asks
  await step(page, /Where is your practice right now\?/, () => radio(page, /Beginning/));
  // The marketing interview (tests/e2e/marketing-interview.spec.ts has the other paths).
  await step(page, /How do new clients find you now\?/, () => page.getByRole("button", { name: "Word of mouth", exact: true }).click());
  await step(page, /Do you have an Instagram for your practice\?/, () => radio(page, "Yes, I have one"));
  await step(page, /What should your posts help with\?/, () => page.getByRole("button", { name: "Fill my open spots" }).click());
  // All five topics start picked.
  await step(page, /What should your posts be about\?/, () => page.getByRole("button", { name: "Office and telehealth", pressed: true }).click());
  await step(page, /How often do you want to post\?/, () => radio(page, "3 times a week"));
  await step(page, /What should posts never show\?/, none, "skip");
  await step(page, /Which one sounds most like you\?/, () => radio(page, /Plain/));
  await step(page, /Do you have a website for your practice\?/, () => radio(page, "No, a website isn't for me"));
  await step(page, /Connect your tools/, none);
  await step(page, /text clients/, () => radio(page, "Yes"));
  // Referrals' own setup question (lib/referrals/onboarding.ts); the ZIP one is skipped because she has an office.
  await step(page, /Who would you like to hear from\?/, async () => {
    // Referrals' load() prefills its defaults; she adds one more.
    await expect(page.getByRole("button", { name: "Family medicine" })).toHaveAttribute("aria-pressed", "true");
    const oncology = page.getByRole("button", { name: "Oncology" });
    if ((await oncology.getAttribute("aria-pressed")) !== "true") await oncology.click();
    await expect(oncology).toHaveAttribute("aria-pressed", "true");
  });
  // Front Desk's own setup questions (lib/frontdesk/onboarding.ts).
  // Skipping the greeting keeps the suggested one, shown on the Front Desk page.
  await step(page, /voicemail greeting/, none, "skip");
  await step(page, /How should I ask/, () => radio(page, /Ask me first/));
  await step(page, /miss a call/, () => radio(page, "No"));

  // 8 · Your team, then home.
  await expect(heading(page)).toHaveText("Meet your team");
  await expect(page.getByText(/You're just opening/)).toBeVisible();
  expect(await seriousViolations(page)).toEqual([]);
  await page.getByRole("button", { name: "Finish setup" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /^(Good (morning|afternoon|evening)|Hello)\b/ })).toBeVisible();

  const todo = page.getByRole("region", { name: "Still to set up" });
  await expect(todo).toContainText("What's your NPI number?");
  await expect(todo).toContainText("What's your practice's tax ID (EIN)?");
  await expect(todo).not.toContainText("malpractice"); // Skip means "not for me"; only Set up later, or a skip that a form needs, is listed
  expect(await seriousViolations(page)).toEqual([]);

  // "Answer" opens that one question again.
  await todo.getByRole("link", { name: "Answer" }).first().click();
  await expect(heading(page)).toHaveText("What's your NPI number?");
});

test("She can stop and pick up where she left off", async ({ page }) => {
  test.setTimeout(120_000); // five screens, each with axe and the local client-detail guard
  freshInstall();
  await page.goto("/onboarding");
  await step(page, /What's your name\?/, () => page.getByLabel("Your name").fill("Dana Reyes"));
  await step(page, /Connect Aeon's brain/, none, "skip");
  await step(page, /What's your practice called\?/, none, "skip");
  await step(page, /Which state/, () => pick(page, page, "State", "Illinois"));
  await step(page, /What kind of license/, () => radio(page, /LCPC/));
  await page.reload();
  await expect(heading(page)).toHaveText(/How do clients reach/);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("radio", { name: /LCPC/ })).toBeChecked();
});

test("Keyboard only: Next is reachable and works with Enter", async ({ page }) => {
  freshInstall();
  await page.goto("/onboarding");
  await expect(heading(page)).toBeFocused(); // a screen reader starts on the question
  await page.keyboard.press("Tab");
  await page.keyboard.type("Dana Reyes");
  for (let i = 0; i < 12 && !(await next(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press("Tab");
  await expect(next(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(heading(page)).toHaveText(/Connect Aeon's brain/);
});

test("Larger text at a narrow window: nothing scrolls sideways and axe stays clean", async ({ page }) => {
  freshInstall();
  for (const width of [640, 320]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/onboarding");
    await page.getByRole("switch", { name: /Larger text/ }).click();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways, `horizontal scroll at ${width}px`).toBeLessThanOrEqual(0);
    expect(await seriousViolations(page)).toEqual([]);
    // The setting follows her to every page.
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-text-size", "large");
    await page.getByRole("switch", { name: /Larger text/ }).click();
  }
});

test("Dana's demo practice is already set up, so the app opens on the chat", async ({ page }) => {
  execSync("npm run db:reset", { stdio: "ignore" });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /^(Good (morning|afternoon|evening)|Hello)\b/ })).toBeVisible();
  await page.goto("/onboarding?q=fees");
  await expect(heading(page)).toHaveText(/What do you charge/);
});
