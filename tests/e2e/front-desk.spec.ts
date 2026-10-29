import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { execSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import * as F from "../fixtures/frontdesk/calcom-setup";

// Front Desk page on the demo data ([Sample] callers): what needs her, the
// calls and texts, Up next, the phone and calendar Connect cards, the switches.
test.beforeAll(() => {
  execSync("npm run db:reset", { stdio: "ignore" });
});

// The Connect Cal.com test disconnects Cal.com, and playwright.config.ts may reuse a
// server already running on its port. So it only runs when the person running the
// suite says the server is on a throwaway database (FRONT_DESK_E2E_DB=throwaway), and
// it never touches a stored Cal.com connection otherwise.
const throwawayDb = process.env.FRONT_DESK_E2E_DB === "throwaway";
const disconnectCalcom = (request: import("@playwright/test").APIRequestContext, origin: string) =>
  request.delete("/api/front-desk/calendar", { headers: { origin } });

// Toasts fade in (checked on their own in ui-lab-toasts.spec.ts); mid-fade colors aren't real contrast.
const axe = async (page: import("@playwright/test").Page) => {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("[data-sonner-toaster]").analyze();
  return results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
};

test("Front Desk shows sample callers, filters, Up next and both Connect cards", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto("/front-desk");
  await expect(page.getByRole("heading", { name: "Front Desk", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs you" })).toBeVisible();
  await expect(page.getByText("[Sample] Jordan Example asked whether you offer couples sessions.")).toBeVisible();
  await expect(page.getByText("[Sample] Sam Example").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Up next" })).toBeVisible();
  await expect(page.getByText(/FD-1001/)).toBeVisible();

  await page.getByRole("link", { name: "Booked" }).click();
  await expect(page).toHaveURL(/filter=booked/);
  await expect(page.getByRole("link", { name: "Booked" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("[Sample] Riley Example")).toHaveCount(0);

  const phone = page.getByRole("region", { name: "Practice phone" });
  await expect(phone.getByText("Spruce Health")).toBeVisible();
  await expect(phone.getByRole("button", { name: "Copy the message" })).toBeVisible();
  await expect(phone.getByRole("button", { name: "Connect" })).toBeDisabled();
  const cal = page.getByRole("region", { name: "Consult calendar" });
  await expect(cal.getByText("Google Calendar: coming later.")).toBeVisible();
  await expect(cal.getByRole("radio")).toHaveCount(0);

  await expect(page.getByRole("switch", { name: "Book when a caller picks a time" })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Text a reminder the day before" })).toBeVisible();
  expect(await axe(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a bad Spruce token gets a plain fix, read out as an alert", async ({ page }) => {
  await page.goto("/front-desk");
  const phone = page.getByRole("region", { name: "Practice phone" });
  await phone.getByLabel("Spruce token").fill("short");
  await phone.getByRole("button", { name: "Connect" }).click();
  await expect(phone.getByText(/too short/)).toBeVisible();
});

test("crisis alerts stay pinned first until she marks them seen", async ({ page, request }) => {
  await page.goto("/front-desk");
  const firstAlert = page.getByRole("region", { name: "Needs you" }).getByRole("listitem").first();
  await expect(firstAlert).toBeVisible();
  await firstAlert.getByRole("button", { name: /Done|I've seen this/ }).click();
  await expect(page.getByText("[Sample] Jordan Example asked whether you offer couples sessions.")).toHaveCount(0);
  expect((await request.get("/api/front-desk/check")).ok()).toBe(true);
});

test("works at 200% text with no sideways scrolling", async ({ page }) => {
  await page.goto("/front-desk");
  await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Front Desk", level: 1 })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  expect(await axe(page)).toEqual([]);
});

test("Settings › Connections lists the phone and Cal.com cards after Google", async ({ page }) => {
  await page.goto("/settings/connections");
  await expect(page.getByRole("region", { name: "Cal.com", exact: true })).toBeVisible();
  const titles = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  const at = (t: string) => titles.indexOf(t);
  expect(at("Google")).toBeGreaterThanOrEqual(0);
  expect(at("Practice phone")).toBeGreaterThan(at("Google"));
  expect(at("Cal.com")).toBeGreaterThan(at("Practice phone"));
  await expect(page.getByRole("region", { name: "Practice phone" }).getByLabel("Spruce token")).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

// A stand-in for Cal.com's API (CALCOM_API_BASE in playwright.config.ts), answering
// with the recorded and doc-shaped fixtures. "cal_live_bad…" keys get a 401.
let calcom: Server | null = null;
test.beforeAll(async () => {
  calcom = createServer((req, res) => {
    const bad = String(req.headers.authorization).includes("cal_live_bad");
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const body =
      bad ? null
      : path === "/me" ? F.me
      : path === "/schedules/default" ? F.schedule
      : path === "/event-types" ? F.list(F.isaiahConsult)
      : path === "/slots" ? F.spikeSlots
      : null;
    res.writeHead(bad ? 401 : body ? 200 : 404, { "content-type": "application/json" });
    res.end(JSON.stringify(body ?? { status: "error" }));
  });
  await new Promise<void>((ok, fail) => calcom!.once("error", fail).listen(3299, "127.0.0.1", () => ok()));
});
test.afterAll(async () => {
  await new Promise((ok) => calcom?.close(ok));
});

test("Connect Cal.com: the button opens Cal.com's key page, one paste connects and shows the next open time", async ({ page, request, baseURL }) => {
  test.skip(!throwawayDb, "Disconnects Cal.com: set FRONT_DESK_E2E_DB=throwaway to run it against a throwaway database.");
  await disconnectCalcom(request, baseURL!);
  await page.goto("/front-desk");
  const cal = page.getByRole("region", { name: "Consult calendar" });
  const open = cal.getByRole("link", { name: /Connect Cal\.com/ });
  await expect(open).toHaveAttribute("href", "https://app.cal.com/settings/developer/api-keys");
  await expect(open).toHaveAttribute("target", "_blank");
  await expect(cal.getByRole("link", { name: /Sign up first/ })).toHaveAttribute("href", "https://cal.com/signup");
  await expect(cal.getByRole("region", { name: "Steps in Cal.com" }).getByRole("listitem")).toHaveCount(3);

  const box = cal.getByLabel("Paste your Cal.com key");
  // Typing never connects on its own; the Check button does.
  await box.fill("cal_live_bad0123456789");
  await expect(cal.getByText(/That key didn't work/)).toHaveCount(0);
  await cal.getByRole("button", { name: "Check" }).click();
  await expect(cal.getByText("That key didn't work. Copy it again from Cal.com and paste all of it.")).toBeVisible();
  expect(await axe(page)).toEqual([]);

  // A paste connects by itself.
  await box.fill("");
  await box.evaluate((el, key) => {
    const data = new DataTransfer();
    data.setData("text", key);
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, "cal_live_fake0123456789abcdef");
  await expect(cal.getByRole("status")).toHaveText(/Connected ✓ · next open time \w{3} \d{1,2}(:\d{2})?(am|pm)/);
  await expect(box).toHaveCount(0); // the key is never shown again
  expect(await axe(page)).toEqual([]);

  await page.goto("/settings/connections");
  await expect(page.getByRole("region", { name: "Cal.com", exact: true }).getByText(/Connected · Free 15-Minute Consultation/)).toBeVisible();
  expect((await disconnectCalcom(request, baseURL!)).ok()).toBe(true);
});
