import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

// The shared Connect card (components/connections/card-frame.tsx) on a narrow card:
// the status never sits on top of the title or description, and the description
// keeps most of the card's width. Checked on the phone card, which sits in a
// two-column grid on Front Desk and full width in Settings › Connections.
// CARD_SHOTS_DIR=<folder> CARD_SHOTS_TAG=after also saves a screenshot of each card.

const SHOTS = process.env.CARD_SHOTS_DIR;
const TAG = process.env.CARD_SHOTS_TAG ?? "after";

type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

async function measure(card: Locator) {
  return card.evaluate((el) => {
    const header = el.firstElementChild as HTMLElement;
    const title = header.querySelector("h2") as HTMLElement;
    const description = title.nextElementSibling as HTMLElement;
    const status = (header.lastElementChild as HTMLElement).firstElementChild as HTMLElement;
    const style = getComputedStyle(el);
    const content = el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const plain = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
    // The element's box and every line of its text: a long word can spill past a squeezed box.
    const boxes = (n: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(n);
      return [plain(n.getBoundingClientRect()), ...[...range.getClientRects()].map(plain)];
    };
    return { title: boxes(title), description: boxes(description), status: plain(status.getBoundingClientRect()), descriptionWidth: description.getBoundingClientRect().width, content, statusText: status.textContent ?? "" };
  });
}

const settle = (page: Page) =>
  page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity));

for (const width of [400, 1440]) {
  for (const scheme of ["light", "dark"] as const) {
    for (const path of ["/front-desk", "/settings/connections"]) {
      test(`phone card at ${width}px ${scheme} on ${path}: status clear of the text`, async ({ page }, info) => {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
        await page.goto(path);
        const card = page.getByRole("region", { name: "Practice phone" });
        await expect(card).toBeVisible();
        await settle(page);
        const m = await measure(card);
        const sum = (rects: Box[]) => Math.round(rects.reduce((n, r) => n + overlap(m.status, r), 0));
        const titleOverlap = sum(m.title);
        const descriptionOverlap = sum(m.description);
        const descriptionShare = m.descriptionWidth / m.content;
        info.annotations.push({ type: "metrics", description: JSON.stringify({ width, scheme, path, titleOverlap, descriptionOverlap, descriptionShare: Number(descriptionShare.toFixed(3)), status: m.statusText }) });

        if (SHOTS) {
          const page_ = path === "/front-desk" ? "" : "settings-";
          await card.screenshot({ path: `${SHOTS}/phone-card-${page_}${TAG}-${width}-${scheme}.png` });
        }
        if (TAG === "before") return;

        expect(titleOverlap).toBe(0);
        expect(descriptionOverlap).toBe(0);
        expect(descriptionShare).toBeGreaterThanOrEqual(0.6);

        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude("[data-sonner-toaster]").analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  }
}
