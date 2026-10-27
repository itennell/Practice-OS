import { readFileSync } from "node:fs";
import https from "node:https";
import path from "node:path";
import { rootCertificates } from "node:tls";

// Reads an official page ourselves to confirm a quoted rule is really on it,
// with no third-party scraper. Read-only, public pages, no credentials sent.
//
// Trust: Node's own root store plus Sectigo's public intermediate (ilga.gov
// sends only its leaf certificate). The chain must still reach a trusted root;
// nothing here turns certificate checks off.

const EXTRA_INTERMEDIATES = [readFileSync(path.join(process.cwd(), "lib", "certs", "sectigo-ov-r40.pem"), "utf8")];
const agent = new https.Agent({ ca: [...rootCertificates, ...EXTRA_INTERMEDIATES], keepAlive: false });

const MAX_BYTES = 3_000_000;
const TIMEOUT_MS = 20_000;

export type PageRead =
  | { ok: true; url: string; text: string }
  | { ok: false; url: string; reason: "unreachable" | "not_html" | "too_short" | "http_error" | "blocked"; detail: string };

/** Sites that refuse scripts (eCFR asks for its API instead). We respect that and never work around it. */
const BLOCK_PAGE = /flagged as potentially automated|complete the captcha|request access|access denied|enable javascript to/i;

/** Visible text of an HTML page: no tags, scripts, styles or entities; single spaces. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&sect;/g, "§")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t\r\f\v]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .trim();
}

/** Lowercase letters, digits and $ only, single-spaced: so a quote matches across formatting. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9$]+/g, " ")
    .trim();
}

function get(url: string, redirectsLeft: number): Promise<PageRead> {
  return new Promise((resolve) => {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return resolve({ ok: false, url, reason: "unreachable", detail: "bad URL" });
    }
    if (parsed.protocol !== "https:") return resolve({ ok: false, url, reason: "unreachable", detail: "not https" });

    const req = https.get(
      parsed,
      { agent, timeout: TIMEOUT_MS, headers: { "User-Agent": "Practice-OS rule check (+https://github.com/itennell/Practice-OS)", Accept: "text/html" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          return resolve(get(new URL(res.headers.location, parsed).toString(), redirectsLeft - 1));
        }
        if (status !== 200) {
          res.resume();
          return resolve({ ok: false, url, reason: "http_error", detail: `HTTP ${status}` });
        }
        const type = String(res.headers["content-type"] ?? "");
        if (!/html|text\/plain/i.test(type)) {
          res.resume();
          return resolve({ ok: false, url, reason: "not_html", detail: type || "unknown type" });
        }
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > MAX_BYTES) req.destroy(new Error("page too large"));
          else chunks.push(c);
        });
        res.on("end", () => {
          // ilga.gov sends windows-1252; decode by the declared charset, not as UTF-8.
          const charset = /charset=([\w-]+)/i.exec(type)?.[1]?.toLowerCase() ?? "utf-8";
          let raw: string;
          try {
            raw = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            raw = Buffer.concat(chunks).toString("utf8");
          }
          const text = htmlToText(raw);
          if (BLOCK_PAGE.test(text) && text.length < 4000) return resolve({ ok: false, url, reason: "blocked", detail: "the site refuses automated reads" });
          if (text.length < 50) return resolve({ ok: false, url, reason: "too_short", detail: `${text.length} characters` });
          resolve({ ok: true, url, text });
        });
        res.on("error", (e) => resolve({ ok: false, url, reason: "unreachable", detail: e.message }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", (e) => resolve({ ok: false, url, reason: "unreachable", detail: e.message }));
  });
}

/** A hard limit on the whole read: the socket timeout alone only fires when a connection goes quiet. */
const TOTAL_MS = 30_000;

export function readPage(url: string): Promise<PageRead> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<PageRead>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, url, reason: "unreachable", detail: `no full reply in ${TOTAL_MS / 1000}s` }), TOTAL_MS);
  });
  return Promise.race([get(url, 3), limit]).finally(() => clearTimeout(timer));
}

export type PageCheck = "on_page" | "not_on_page" | "unreadable";

/** on_page: the quote is in the page text. not_on_page: the page read fine and the quote isn't there. */
export async function quoteOnPage(url: string, quote: string): Promise<{ result: PageCheck; detail: string }> {
  const page = await readPage(url);
  if (!page.ok) return { result: "unreadable", detail: `${page.reason}: ${page.detail}` };
  return normalizeForMatch(page.text).includes(normalizeForMatch(quote))
    ? { result: "on_page", detail: "quote found" }
    : { result: "not_on_page", detail: "page read, quote not found" };
}
