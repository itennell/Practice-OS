import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";

// Media › Directories: Aeon's Psychology Today interview beside the profile preview.
// The fictional demo practice answers every question with the fixture answers below,
// then each section of the preview, one section's Copy and "Copy all, in order" are
// checked against the clipboard. The same interview starts from a fresh Aeon chat,
// replayed from its recorded model replies (tests/fixtures/aeon-chat/pt-profile.json).

const SECTIONS = ["header", "statement", "photos", "consult", "glance", "finances", "qualifications", "specialties", "endorsements", "clientFocus", "treatment", "location"];
const TITLES = ["NAME AND TITLE", "PERSONAL STATEMENT", "PHOTOS", "FREE CONSULTATION", "MY PRACTICE AT A GLANCE", "FINANCES", "QUALIFICATIONS", "SPECIALTIES AND EXPERTISE", "ENDORSEMENTS", "CLIENT FOCUS", "TREATMENT APPROACH", "LOCATION"];

const ANSWERS: Record<string, string | number | string[] | null> = {
  header: null,
  focus: "Anxiety, big life changes, and couples who feel stuck",
  firstSession: "We talk about what brought you in and what you hope will change",
  approach: "Talk therapy with practical tools, and CBT when it fits",
  why: "I like helping people feel at home in their own lives",
  photo: null,
  freeConsultMinutes: "Yes, 15 minutes",
  availability: "Yes, taking new clients",
  sessionFormat: ["In Person", "Online"],
  fees: null,
  paymentMethods: ["Cash", "Visa"],
  slidingScale: "Yes",
  insurance: null,
  yearsInPractice: 6,
  education: "MA, Clinical Mental Health Counseling, Example University [Sample], 2019",
  extraCredentials: "Gottman Level 1 training, 2022",
  topSpecialties: ["Anxiety", "Life Transitions", "Relationship Issues"],
  expertise: ["Stress", "Grief", "Burnout in caregivers"],
  endorsements: null,
  ages: ["Adults"],
  participants: ["Individuals", "Couples"],
  communities: [],
  faith: [],
  languages: "Spanish",
  therapyTypes: ["Cognitive Behavioral (CBT)", "Gottman Method"],
  location: null,
  nearby: "Lakeview, Old Town, 60657",
};

test.beforeEach(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const interview = (page: Page) => page.getByTestId("pt-interview");
const preview = (page: Page) => page.getByTestId("pt-preview");
const section = (page: Page, id: string) => preview(page).locator(`[data-section="${id}"]`);

async function currentStep(page: Page): Promise<string | null> {
  const form = interview(page).locator("form[data-step]");
  if (!(await form.count())) return null;
  return form.getAttribute("data-step");
}

async function answer(page: Page, id: string) {
  const form = interview(page).locator(`form[data-step="${id}"]`);
  const want = ANSWERS[id];
  if (Array.isArray(want)) {
    const chips = form.getByRole("group").getByRole("button");
    for (const chip of await chips.all()) {
      const label = (await chip.innerText()).trim();
      if ((await chip.getAttribute("aria-pressed")) === "true" && !want.includes(label)) await chip.click();
    }
    for (const label of want) {
      const chip = form.getByRole("group").getByRole("button", { name: label, exact: true });
      if (await chip.count()) {
        if ((await chip.getAttribute("aria-pressed")) !== "true") await chip.click();
      } else {
        await form.getByLabel("Not listed? Add your own").fill(label);
        await form.getByRole("button", { name: "Add", exact: true }).click();
      }
    }
  } else if (typeof want === "string" && (await form.getByRole("radio", { name: want }).count())) {
    await form.getByRole("radio", { name: want }).click();
  } else if (want !== null) {
    await form.locator("textarea, input").first().fill(String(want));
  }
  await form.getByRole("button", { name: /^(Save and continue|Looks right|Next)$/ }).click();
  await expect(interview(page).locator(`form[data-step="${id}"]`)).toHaveCount(0);
}

async function answerAll(page: Page) {
  for (let i = 0; i < 40; i++) {
    const id = await currentStep(page);
    if (!id) return;
    await answer(page, id);
  }
  throw new Error("The interview never finished.");
}

test("Directories: the interview fills every section of the preview, and Copy matches it", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  await page.goto("/media");
  await expect(interview(page)).toContainText("Welcome. Let's set up your Psychology Today profile.");
  await expect(preview(page)).toContainText("Preview of how your profile will read");
  await expect(preview(page)).toContainText("Not affiliated with Psychology Today.");

  await answerAll(page);
  await expect(interview(page).getByRole("heading", { name: "Your profile is ready to write" })).toBeVisible();

  for (const id of SECTIONS) await expect(section(page, id)).toBeVisible();
  await expect(section(page, "header")).toContainText("Dana Reyes, LCPC");
  await expect(section(page, "statement")).toContainText("couples who feel stuck");
  await expect(section(page, "glance")).toContainText("Taking new clients");
  await expect(section(page, "glance")).toContainText("I specialize in Anxiety, Life Transitions and Relationship Issues");
  await expect(section(page, "finances")).toContainText("Cash, Visa");
  await expect(section(page, "qualifications")).toContainText("Licensed by the State of Illinois (LCPC)");
  await expect(section(page, "qualifications")).toContainText("Gottman Level 1 training, 2022");
  await expect(section(page, "specialties")).toContainText("Burnout in caregivers");
  await expect(section(page, "endorsements")).toContainText("Aeon never writes one");
  await expect(section(page, "clientFocus")).toContainText("Spanish");
  await expect(section(page, "treatment")).toContainText("Gottman Method");
  await expect(section(page, "location")).toContainText("Lakeview, Old Town, 60657");
  await expect(preview(page)).not.toContainText(/\b\d{3}[.-]\d{6}\b/);

  await section(page, "finances").getByRole("button", { name: "Copy Finances", exact: true }).click();
  const one = await page.evaluate(() => navigator.clipboard.readText());
  expect(one).toContain("Payment methods: Cash, Visa");
  expect(one).toContain("Sliding scale: Yes");

  await page.getByRole("button", { name: /^Copy all, in order/ }).click();
  const all = await page.evaluate(() => navigator.clipboard.readText());
  expect(all.startsWith("Psychology Today profile for Dana Reyes, LCPC (fictional demo practice)")).toBe(true);
  expect(all).toContain("Read it and make it yours");
  const at = TITLES.map((t) => all.indexOf(`${t}\n`));
  expect(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1]))).toBe(true);

  // The paste steps and the other places to list her practice stay under it.
  await expect(page.getByRole("heading", { name: "How to paste it in" })).toBeVisible();
  await expect(page.getByText(/Other places to list yourself/)).toBeVisible();
});

test("Directories: limits and blocked words are refused in plain words", async ({ page, request, baseURL }) => {
  await page.goto("/media");
  await answer(page, "header");
  const focus = interview(page).locator('form[data-step="focus"]');
  await expect(focus.locator("textarea")).toHaveAttribute("maxlength", "200");
  await focus.locator("textarea").fill("My clients say I changed their life.");
  await focus.getByRole("button", { name: "Save and continue" }).click();
  await expect(interview(page).getByRole("alert")).toContainText(/testimonial/i);
  await focus.locator("textarea").fill("I guarantee you will feel better in 6 sessions.");
  await focus.getByRole("button", { name: "Save and continue" }).click();
  await expect(interview(page).getByRole("alert")).toContainText(/Promises a result/);

  const post = (data: unknown) => request.post("/api/media/pt", { data, headers: { origin: baseURL! } });
  const long = await post({ step: "why", value: "word ".repeat(60) });
  expect(long.status()).toBe(422);
  expect((await long.json()).error).toMatch(/under 200/);
  const two = await post({ step: "topSpecialties", value: ["Anxiety", "Grief"] });
  expect(two.status()).toBe(422);
  expect((await two.json()).error).toMatch(/exactly 3/);
  const advice = await post({ step: "nearby", value: "You should try breathing exercises" });
  expect(advice.status()).toBe(422);
  const crisis = await post({ step: "why", value: "Some days I want to kill myself" });
  expect(crisis.status()).toBe(422);
  expect((await crisis.json()).error).toMatch(/988/);
});

test("A fresh Aeon chat starts the same interview", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts pt-profile", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto(`/?c=${id}`);
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("Set up my Psychology Today profile")).toBeVisible();
  await expect(log).toContainText("Welcome. Let's set up your Psychology Today profile.");
  await expect(log).toContainText(/how do you like to work/i);

  // Her chat answers are the page's answers: the interview there picks up at the same question.
  await page.goto("/media");
  await expect(interview(page).locator('form[data-step="approach"]')).toBeVisible();
  await expect(section(page, "statement")).toContainText(/anxiety, big life changes, and couples who feel stuck/i);
});

for (const scheme of ["light", "dark"] as const) {
  for (const size of [
    { name: "desktop", width: 1400, height: 900 },
    { name: "phone", width: 390, height: 844 },
  ]) {
    test(`axe: Directories, ${scheme}, ${size.name}`, async ({ page }, info) => {
      test.skip(info.project.name !== "desktop-light", "Each scheme and size is set here, so one project covers them.");
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto("/media");
      await expect(interview(page)).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      // A chip question, then the finished state.
      for (const id of ["header", "focus", "firstSession", "approach", "why", "photo", "freeConsultMinutes", "availability"]) await answer(page, id);
      await expect(interview(page).locator('form[data-step="sessionFormat"]')).toBeVisible();
      expect(await seriousViolations(page)).toEqual([]);
      await answerAll(page);
      expect(await seriousViolations(page)).toEqual([]);
    });
  }
}
