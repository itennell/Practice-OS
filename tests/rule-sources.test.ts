// Live check of every shipped rule's source and every how-do-i guide link: the page loads, and the quote is
// still on it. Runs only when FIRECRAWL_URL is set (a self-hosted Firecrawl;
// several state sites block plain scripted fetches). Slow: about a minute.
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";
import { SHIPPED_RULES } from "../lib/compliance/rules";
import { allGuides } from "../lib/guides";

loadEnv();
const firecrawl = process.env.FIRECRAWL_URL;

/** Lowercase, plain spaces, no markdown, no punctuation: so a quote matches across formatting. */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/<[^>]+>|[`*_|\\]/g, " ")
    .replace(/[^a-z0-9$]+/g, " ")
    .trim();

/** Some sites (psypact.gov) briefly refuse repeat visits; try a failed page once more after a pause. */
async function scrapeWithRetry(url: string): Promise<{ status: number; text: string }> {
  const first = await scrape(url).catch(() => ({ status: 0, text: "" }));
  if (first.status === 200) return first;
  await new Promise((r) => setTimeout(r, 8_000));
  return scrape(url).catch(() => ({ status: 0, text: "" }));
}

async function scrape(url: string): Promise<{ status: number; text: string }> {
  const res = await fetch(`${firecrawl}/v1/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], timeout: 90_000 }),
  });
  const body = (await res.json()) as { data?: { markdown?: string; metadata?: { statusCode?: number } } };
  return { status: body.data?.metadata?.statusCode ?? 0, text: body.data?.markdown ?? "" };
}

describe.skipIf(!firecrawl)("rule sources (live)", () => {
  const byUrl = new Map<string, string[]>();
  for (const r of SHIPPED_RULES) {
    if (!r.source.url) continue;
    const quotes = byUrl.get(r.source.url) ?? [];
    if (r.source.quote) quotes.push(r.source.quote);
    byUrl.set(r.source.url, quotes);
  }
  // Guides' official pages and sources must load too (no quote to match).
  for (const g of allGuides()) for (const url of [g.official_url, ...g.sources.map((s) => s.url)]) if (!byUrl.has(url)) byUrl.set(url, []);

  it(
    "every source page loads and still carries its quote",
    async () => {
      const urls = [...byUrl.keys()];
      const failures: string[] = [];
      for (let i = 0; i < urls.length; i += 6) {
        const batch = urls.slice(i, i + 6);
        const pages = await Promise.all(batch.map((u) => scrapeWithRetry(u)));
        batch.forEach((url, j) => {
          const { status, text } = pages[j];
          if (status !== 200) return void failures.push(`${status} ${url}`);
          const page = norm(text);
          for (const q of byUrl.get(url) ?? []) if (!page.includes(norm(q))) failures.push(`quote missing on ${url}: "${q}"`);
        });
      }
      expect(failures).toEqual([]);
    },
    600_000,
  );
});
