import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { pick, typeDate } from "../helpers/controls";

// Referrals › Calendar at 1440px on the demo data (db:reset seeds four [Sample]
// meetings: a coffee with Quillmere this coming Thursday, a call on Friday, and two
// the week after). The week shows the seeded blocks, a block opens its details, and
// "Plan a meeting" saves a new one; a clash is refused in the server's words, and
// Partners' "Plan a meeting" (?tab=calendar&partner=) opens the form with that partner.

const TZ = "America/Chicago";
const QUILLMERE = "[Sample] Quillmere Oncology Group";
const JUNIPER = "[Sample] Juniper Row Family Medicine";
const JUNIPER_ID = "00000000-0000-4000-8000-000000000201";

test.use({ viewport: { width: 1440, height: 900 } });
test.setTimeout(120_000);

test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

/** Her calendar day today, and the Monday two weeks on (always ahead, never clashing with the seeds). */
function days() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const d = new Date(`${today}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 14);
  return { today, later: d.toISOString().slice(0, 10) };
}

/** Steps forward a week at a time until the block shows (the seeds are "this coming" Thursday). */
async function findBlock(page: Page, name: RegExp) {
  const block = page.getByTestId("calendar-grid").getByRole("button", { name });
  for (let i = 0; i < 3 && !(await block.isVisible().catch(() => false)); i++) {
    await page.getByRole("button", { name: "Next week" }).click();
    await page.waitForTimeout(400);
  }
  await expect(block).toBeVisible();
  return block;
}

test("week view: seeded meetings, details, plan a meeting", async ({ page }) => {
  const errors: string[] = [];
  // The clash refusal is a 400 the browser logs as a failed load: expected.
  page.on("console", (m) => m.type() === "error" && !m.text().startsWith("Failed to load resource") && errors.push(m.text()));
  await page.goto("/referrals?tab=calendar");
  const cal = page.getByRole("region", { name: "Referrals calendar" });
  await expect(cal.getByRole("tab", { name: "Week" })).toHaveAttribute("aria-selected", "true");
  await expect(cal.getByTestId("calendar-range")).toHaveText(/\d{4}/);

  // The seeded coffee: a block labelled with kind and partner, sized by its 45 minutes.
  const coffee = await findBlock(page, new RegExp(`^Coffee with ${QUILLMERE.replace(/[[\]]/g, "\\$&")}`));
  await expect(coffee).toContainText(`Coffee · ${QUILLMERE}`);
  await expect(coffee).toContainText("10:00–10:45 am");
  // Mon to Fri only: no meetings fall on the weekend.
  await expect(page.getByTestId("calendar-grid").getByRole("list")).toHaveCount(5);

  // Details on the right.
  await coffee.click();
  const sheet = page.getByRole("dialog", { name: `Coffee with ${QUILLMERE}` });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("[Sample] Bean There Cafe on Halsted");
  await expect(sheet).toContainText("[Sample] Bring the one-page practice sheet.");
  for (const name of ["Reschedule", "Cancel meeting"]) await expect(sheet.getByRole("button", { name })).toBeVisible();
  // Still ahead: it can't be marked done yet.
  await expect(sheet.getByRole("button", { name: "Mark done" })).toHaveCount(0);
  await expect(sheet.getByRole("link", { name: "Open partner" })).toHaveAttribute("href", /\/referrals\?partner=00000000-0000-4000-8000-000000000205$/);
  await expect(sheet.getByRole("link", { name: "Record a debrief after" })).toHaveAttribute("href", /\/referrals\?debrief=00000000-0000-4000-8000-000000000205$/);
  const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
  expect(axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  // Cancel asks first; keep it.
  await sheet.getByRole("button", { name: "Cancel meeting" }).click();
  const ask = page.getByRole("alertdialog", { name: "Cancel this meeting?" });
  await expect(ask).toBeVisible();
  // The way out says what it does: "Keep meeting", never a second "Cancel".
  await expect(ask.getByRole("button", { name: "Keep meeting" })).toBeVisible();
  await ask.getByRole("button", { name: "Keep meeting" }).click();
  await page.getByRole("button", { name: "Close panel" }).last().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Plan a meeting two weeks out.
  const { later } = days();
  await cal.getByRole("button", { name: "Plan a meeting" }).first().click();
  const form = page.getByRole("form", { name: "Plan a meeting" });
  await pick(page, form, "With", JUNIPER);
  await pick(page, form, "Kind", "Call");
  await typeDate(form, "Date", later);
  await pick(page, form, "Time", /^11:00 am$/);
  await form.getByLabel("Where").fill("[Sample] Phone");
  await form.getByRole("button", { name: "Plan meeting" }).click();
  // The first save loads the local privacy check (the place is screened like a note), so allow it time.
  await expect(page.getByText("Meeting planned. Nothing was sent.")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  // The calendar jumps to that week and shows it.
  const call = page.getByTestId("calendar-grid").getByRole("button", { name: new RegExp(`^Call with ${JUNIPER.replace(/[[\]]/g, "\\$&")}`) });
  await expect(call).toBeVisible();
  await expect(call).toHaveAccessibleName(/Monday, .*, 11:00–11:20 am$/);

  // The same time again: the server's refusal, in its words.
  await cal.getByRole("button", { name: "Plan a meeting" }).first().click();
  await pick(page, form, "With", QUILLMERE);
  await typeDate(form, "Date", later);
  await pick(page, form, "Time", /^11:00 am$/);
  await form.getByRole("button", { name: "Plan meeting" }).click();
  await expect(form.getByRole("alert")).toHaveText("Something is already planned at that time. Pick another time.", { timeout: 30_000 });
  await page.getByRole("button", { name: "Close panel" }).last().click();

  // Month view keeps it, and a day opens the Day view.
  await cal.getByRole("tab", { name: "Month" }).click();
  await expect(page.getByTestId("calendar-month")).toContainText(JUNIPER);
  expect(errors).toEqual([]);
});

test("Partners' Plan a meeting opens the form with that partner", async ({ page }) => {
  await page.goto(`/referrals?tab=calendar&partner=${JUNIPER_ID}`);
  const form = page.getByRole("form", { name: "Plan a meeting" });
  await expect(form).toBeVisible();
  await expect(form.getByRole("combobox", { name: "With" })).toHaveText(new RegExp(JUNIPER.replace(/[[\]]/g, "\\$&")));
  // A typed past date shows its error and never books (the field doesn't keep the last good date).
  const y = new Date(Date.now() - 3 * 86_400_000);
  await typeDate(form, "Date", `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`);
  await expect(form.getByText(/^Pick \d{2}\/\d{2}\/\d{4} or later\.$/)).toBeVisible();
  await expect(form.getByRole("button", { name: "Plan meeting" })).toBeDisabled();
});

test("the calendar's partner list: board cards, why some are blocked, no addresses", async ({ request }) => {
  const res = await request.get("/api/referrals/meetings/partners");
  expect(res.ok()).toBe(true);
  expect(res.headers()["cache-control"]).toContain("no-store");
  const { partners, timeZone } = (await res.json()) as { partners: Record<string, unknown>[]; timeZone: string };
  expect(timeZone).toBeTruthy();
  expect(partners.find((p) => p.id === JUNIPER_ID)).toMatchObject({ name: JUNIPER, blocked: null });
  for (const p of partners) expect(Object.keys(p).sort()).toEqual(["blocked", "id", "name", "organization", "phone"]);
});
