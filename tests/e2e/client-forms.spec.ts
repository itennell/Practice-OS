import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Download, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import * as mupdf from "mupdf";

// Admin › Client forms (lib/client-forms): the library lists every template, each
// opens with its required-elements check, downloads as a real PDF with her
// practice filled in and the client boxes blank, and edits that drop a required
// element are refused. The chat gives the same template as a document card;
// that conversation is replayed from Muse's recorded replies
// (tests/fixtures/aeon-chat/client-form.json), so no live model call.

const ORIGIN = () => ({ Origin: new URL(test.info().project.use.baseURL!).origin });

/** The fictional demo practice's policies, saved once: no form downloads before that. */
const POLICIES = {
  cancel_hours: 24,
  late_cancel_fee_cents: 0,
  no_show_fee_cents: 0,
  reply_within_hours: 48,
  returned_payment_fee_cents: 0,
  records_fee_note: "",
  privacy_officer: "",
  backup_colleague: "Jordan Lee, LCSW",
  accepts_insurance: false,
  offers_sliding_scale: false,
  texting_ok: true,
  npp_effective_on: "2026-11-01",
};

test.beforeEach(async ({ request }) => {
  execSync("npm run db:reset", { stdio: "ignore" });
  // Policies aren't demo data, so db:reset keeps them: set them to a known state.
  const saved = await request.put("/api/client-forms/policies", { headers: ORIGIN(), data: POLICIES });
  expect(saved.ok(), await saved.text()).toBe(true);
});

async function axeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** Opens the downloaded file as a PDF and returns its text. */
async function pdfText(download: Download) {
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  let text = "";
  for (let i = 0; i < doc.countPages(); i++) text += doc.loadPage(i).toStructuredText("preserve-whitespace").asText();
  return text.replace(/\s+/g, " ");
}

const THREE = [
  { title: "Consent for Telehealth", file: "telehealth-consent.pdf", says: "you are in Illinois" },
  { title: "Notice of Privacy Practices", file: "npp.pdf", says: "THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED" },
  { title: "Informed Consent for Therapy", file: "informed-consent.pdf", says: "A subpoena alone is not enough" },
];

test("Client forms library: three templates open, pass their check and download as real PDFs", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/admin");
  await page.getByRole("link", { name: "All client forms" }).click();
  const panel = page.getByRole("dialog", { name: "Client forms" });
  await expect(panel.getByText(/A client.s filled-in form is never saved in Practice-OS/)).toBeVisible();
  await expect(panel.getByRole("heading", { name: "Required by law" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Patient Health Questionnaire (PHQ-9)", exact: true })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  for (const f of THREE) {
    await page.goto("/admin?panel=forms");
    await panel.getByRole("link", { name: f.title, exact: true }).click();
    await expect(page).toHaveURL(/panel=forms&form=/);
    await expect(panel.getByRole("heading", { name: f.title })).toBeVisible();
    await expect(panel.getByRole("heading", { name: /Checked: all \d+ required parts are on the form/ })).toBeVisible();
    await expect(panel.getByText(/A client.s filled-in form is never saved/)).toBeVisible();
    expect(await axeViolations(page)).toEqual([]);

    const download = page.waitForEvent("download");
    await panel.getByRole("link", { name: "Download PDF" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe(f.file);
    const text = await pdfText(file);
    expect(text).toContain(f.says);
    expect(text).toContain("Reyes Counseling PLLC (fictional demo practice)");
    expect(text).toContain("not legal advice. Have your own attorney review it");
  }
  expect(errors).toEqual([]);
});

test("Editing a template: her wording saves and prints; taking out a required part is refused", async ({ page, request }) => {
  // Her wording isn't demo data, so db:reset keeps it: start from Aeon's wording.
  expect((await request.delete("/api/client-forms/practice_policies", { headers: ORIGIN() })).ok()).toBe(true);
  await page.goto("/admin?panel=forms&form=practice_policies");
  const panel = page.getByRole("dialog", { name: "Client forms" });
  const cancel = panel.getByLabel("Cancellation policy");
  await expect(cancel).toHaveValue(/cancel at least 24 hours/i);

  await cancel.fill("Please call me.");
  await panel.getByRole("button", { name: "Save wording" }).click();
  await expect(panel.getByRole("alert")).toContainText("Cancellation and missed-session fee");

  await cancel.fill("Please cancel at least 48 hours ahead so I can offer the time to someone on my waitlist.");
  await panel.getByRole("button", { name: "Save wording" }).click();
  await expect(panel.getByRole("status")).toContainText("Saved");
  const pdf = await request.get("/api/client-forms/practice_policies/pdf");
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const doc = mupdf.Document.openDocument(await pdf.body(), "application/pdf");
  expect(doc.loadPage(0).toStructuredText("preserve-whitespace").asText().replace(/\s+/g, " ")).toContain("someone on my waitlist");

  // A blank paragraph prints Aeon's wording, and the editor says so.
  await cancel.fill("");
  await expect(panel.getByText(/Uses Aeon's default wording/)).toBeVisible();

  await panel.getByRole("button", { name: "Use Aeon’s wording" }).click();
  await expect(panel.getByRole("status")).toContainText("Back to Aeon");
});

test("A form that isn't ready says why in plain words, and its PDF link gives the reason instead of a PDF", async ({ page, request }) => {
  const unset = await request.put("/api/client-forms/policies", { headers: ORIGIN(), data: { backup_colleague: "" } });
  expect(unset.ok()).toBe(true);
  await page.goto("/admin?panel=forms&form=informed_consent");
  const panel = page.getByRole("dialog", { name: "Client forms" });
  await expect(panel.getByRole("heading", { name: "Not ready to download yet" })).toBeVisible();
  await expect(panel.getByText(/the colleague who will contact clients/).first()).toBeVisible();
  await expect(panel.getByRole("link", { name: "Download PDF" })).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Needs your attorney's review" })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  const pdf = await request.get("/api/client-forms/informed_consent/pdf");
  expect(pdf.status()).toBe(409);
  expect(pdf.headers()["content-type"]).toContain("text/plain");
  expect(await pdf.text()).toContain("can't be downloaded yet");
});

test("Asking Aeon for a telehealth consent form gives the template as a card with Open and Download", async ({ page }) => {
  const id = execSync("npx tsx scripts/seed-chat.ts client-form", { encoding: "utf8" }).trim().split("\n").at(-1)!;
  await page.goto(`/?c=${id}`);
  const log = page.getByRole("log", { name: "Conversation" });
  await expect(log.getByText("make me a telehealth consent form")).toBeVisible();
  const cards = log.getByRole("list", { name: /documents?$/i }).last();
  await expect(cards.getByRole("link", { name: /^Open Consent for Telehealth/ })).toBeVisible();
  expect(await axeViolations(page)).toEqual([]);

  const download = page.waitForEvent("download");
  await cards.getByRole("link", { name: /^Download/ }).first().click();
  const text = await pdfText(await download);
  expect(text).toContain("Consent for Telehealth");
  expect(text).toContain("you are in Illinois");

  const open = cards.getByRole("link", { name: /^Open Consent for Telehealth/ });
  await page.goto((await open.getAttribute("href"))!);
  await expect(page.getByRole("dialog", { name: "Client forms" }).getByRole("heading", { name: "Consent for Telehealth" })).toBeVisible();
});
