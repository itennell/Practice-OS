// What a practice's web page says about how to reach it, read in plain code
// (no HTML library): email addresses from mailto: links, from schema.org data
// (JSON-LD `email`, any @type, and microdata itemprop="email",
// schema.org/email) and written out in the page text, including the
// "name [at] domain [dot] com" style. Phones from JSON-LD `telephone` and tel:
// links. And whether the page asks not to be solicited, in which case Aeon
// uses nothing from the site. Only addresses the page shows are returned:
// nothing is ever guessed from a name.
//
// A page is someone else's text, so every step here runs in linear time: tags
// are found with indexOf, not regexes that can backtrack over a whole page,
// every quantifier on page text is bounded, a page is cut to 600 KB, and the
// whole read stops after a quarter of a second, keeping what it found so far.
import { phoneDigits } from "../evidence/normalize";

export type EmailHow = "mailto" | "schema" | "text";
export type FoundEmail = { value: string; how: EmailHow };
export type PageContacts = {
  emails: FoundEmail[];
  /** Ten digits each. */
  phones: string[];
  noSolicitation: boolean;
  /** How many people the page's schema.org data lists (Person or Physician): a hint that it's a group page. */
  providerCount: number;
};
export type PageLink = { url: string; text: string };

/** The most of a page that is read (the fetcher keeps no more either). */
export const MAX_HTML = 600_000;
/** A tag longer than this isn't one Aeon reads (no real link or meta tag is). */
const MAX_TAG = 4000;
/** The whole read of one page stops after this long, keeping what it found. */
const BUDGET_MS = 250;
/** Words longer than this aren't looked at for an email (254 is the longest address). */
const MAX_WORD = 320;

type Budget = { deadline: number; over: () => boolean };
function budget(ms = BUDGET_MS): Budget {
  const deadline = Date.now() + ms;
  let n = 0;
  return { deadline, over: () => (++n & 63) === 0 && Date.now() > deadline };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", commat: "@", period: ".", lowbar: "_", hyphen: "-" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,8}|#\d{1,8}|[a-z]{1,32});/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** The tag name starting at `at` (lower case), or "" when there isn't one. */
function nameAt(lower: string, at: number): string {
  let end = at;
  while (end < lower.length && end - at < 32) {
    const c = lower.charCodeAt(end);
    const letter = c >= 97 && c <= 122;
    const digit = c >= 48 && c <= 57;
    if (!(letter || (digit && end > at))) break;
    end++;
  }
  return lower.slice(at, end);
}

/** Where the closing `</name>` (any spacing before `>`) starts at or after `from`, or -1. */
function closingAt(lower: string, name: string, from: number): number {
  const needle = `</${name}`;
  let at = lower.indexOf(needle, from);
  while (at >= 0) {
    let k = at + needle.length;
    while (k < lower.length && k - at < 64 && /\s/.test(lower[k])) k++;
    if (lower[k] === ">") return at;
    at = lower.indexOf(needle, at + needle.length);
  }
  return -1;
}

/**
 * Visits every opening tag `<name ...>` in order. `visit` may return where to
 * go on from (to step over a script's contents). Stops at the first `<` with
 * no `>` after it, since no tag can follow.
 */
function scanTags(html: string, lower: string, b: Budget, visit: (name: string, tag: string, start: number, end: number) => number | void): void {
  let i = 0;
  while (i < html.length && !b.over()) {
    const lt = lower.indexOf("<", i);
    if (lt < 0) return;
    const name = nameAt(lower, lt + 1);
    if (!name) {
      i = lt + 1;
      continue;
    }
    const gt = lower.indexOf(">", lt);
    if (gt < 0) return;
    const next = gt - lt <= MAX_TAG ? visit(name, html.slice(lt, gt + 1), lt, gt + 1) : undefined;
    i = typeof next === "number" && next > gt ? next : gt + 1;
  }
}

const CODE_BLOCKS = new Set(["script", "style", "template"]);

/** The page without comments, styles and scripts (JSON-LD is read separately). */
function stripCode(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = lower.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt));
    if (lower.startsWith("<!--", lt)) {
      const end = lower.indexOf("-->", lt + 4);
      if (end < 0) break; // an unclosed comment hides the rest of the page
      out.push(" ");
      i = end + 3;
      continue;
    }
    const name = nameAt(lower, lt + 1);
    if (CODE_BLOCKS.has(name)) {
      const close = closingAt(lower, name, lt);
      if (close < 0) break;
      out.push(" ");
      i = lower.indexOf(">", close) + 1;
      continue;
    }
    out.push("<");
    i = lt + 1;
  }
  return out.join("");
}

/** Text with every `<...>` tag replaced by a space; a `<` with no `>` after it stays as text. */
function dropTags(html: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) {
      out.push(html.slice(i));
      break;
    }
    const gt = html.indexOf(">", lt + 1);
    if (gt < 0) {
      out.push(html.slice(i));
      break;
    }
    out.push(html.slice(i, lt), " ");
    i = gt + 1;
  }
  return out.join("");
}

/** The words a visitor sees. */
export function visibleText(html: string): string {
  return decodeEntities(dropTags(stripCode(html.slice(0, MAX_HTML)))).replace(/\s+/g, " ").trim();
}

const JUNK_LOCAL = new Set(["example", "you", "your", "youremail", "yourname", "name", "email", "username", "someone", "user", "firstname", "first.last"]);
const JUNK_DOMAIN = /(^|\.)(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|sentry\.wixpress\.com|domain\.com|yourdomain\.com|email\.com|mysite\.com|godaddy\.com|squarespace\.com|wix\.com)$/;
const FILE_ENDING = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|mjs|json|pdf|mp4|webm|woff2?|ttf)$/;
const EMAIL = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}$/;
// One address inside a word: the local part starts at a boundary and is at most 64 long.
const EMAIL_IN_WORD = /(?<![a-z0-9._%+-])[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,8}\.[a-z]{2,24}(?![a-z0-9-])/gi;

/** A clean, lower-case address, or null for junk (placeholders, tracking addresses, image names like logo@2x.png). */
export function cleanEmail(raw: string): string | null {
  const v = raw.trim().replace(/^mailto:/i, "").replace(/^[<("'\s]+|[>)"'.,;:\s]+$/g, "").toLowerCase();
  if (v.length > 254 || !EMAIL.test(v)) return null;
  const [local, domain] = v.split("@");
  if (local.length > 64 || JUNK_LOCAL.has(local) || /^(noreply|no-reply|donotreply)$/.test(local)) return null;
  if (JUNK_DOMAIN.test(domain) || FILE_ENDING.test(v) || /^[0-9a-f]{20,}$/.test(local)) return null;
  return v;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

function attr(tag: string, name: string): string | null {
  const m = tag.slice(0, MAX_TAG).match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? "") : null;
}

/** Every value under `key` anywhere in JSON-LD (nested objects, arrays, @graph). */
function collect(node: unknown, key: string, out: string[]): void {
  if (Array.isArray(node)) {
    for (const n of node) collect(n, key, out);
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === key) {
      for (const one of Array.isArray(v) ? v : [v]) if (typeof one === "string") out.push(one);
    }
    if (v && typeof v === "object") collect(v, key, out);
  }
}

function countPeople(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + countPeople(x), 0);
  if (!node || typeof node !== "object") return 0;
  const obj = node as Record<string, unknown>;
  const types = Array.isArray(obj["@type"]) ? obj["@type"] : [obj["@type"]];
  const self = types.some((t) => t === "Person" || t === "Physician") ? 1 : 0;
  return self + Object.values(obj).reduce((n: number, v) => n + (v && typeof v === "object" ? countPeople(v) : 0), 0);
}

function jsonLd(html: string, lower: string, b: Budget): unknown[] {
  const blocks: unknown[] = [];
  scanTags(html, lower, b, (name, tag, _start, end) => {
    if (name !== "script") return;
    const close = closingAt(lower, "script", end);
    if (close < 0) return html.length;
    const type = (attr(tag, "type") ?? "").trim().toLowerCase();
    if (type === "application/ld+json") {
      try {
        blocks.push(JSON.parse(html.slice(end, close).trim()));
      } catch {
        // A broken block is skipped; the rest of the page is still read.
      }
    }
    return close + 1;
  });
  return blocks;
}

// Asks not to be solicited, in the common wordings.
const NO_SOLICITATION = [
  /\bno\s+solicitations?\b/i,
  /\bdo\s+not\s+solicit\b/i,
  /\bno\s+soliciting\b/i,
  /\bunsolicited\s+(commercial\s+)?(emails?|e-mails?|messages?)\s+(are|is)\s+not\s+(accepted|welcome)/i,
  /\bwe\s+do\s+not\s+accept\s+(any\s+)?marketing\b/i,
];

export function saysNoSolicitation(text: string): boolean {
  return NO_SOLICITATION.some((re) => re.test(text));
}

export function extractContacts(page: string, pageUrl: string, opts: { budgetMs?: number } = {}): PageContacts {
  void pageUrl; // kept in the signature so callers pass the page along; relative links don't hold emails
  const b = budget(opts.budgetMs);
  const html = page.slice(0, MAX_HTML);
  const emails: FoundEmail[] = [];
  const seen = new Set<string>();
  const add = (raw: string, how: EmailHow) => {
    const v = cleanEmail(raw.slice(0, 400));
    if (v && !seen.has(v)) {
      seen.add(v);
      emails.push({ value: v, how });
    }
  };
  const phones: string[] = [];
  const addPhone = (raw: string) => {
    const d = phoneDigits(raw.slice(0, 64));
    if (d && !phones.includes(d)) phones.push(d);
  };

  const body = stripCode(html);
  const bodyLower = body.toLowerCase();

  // 1. mailto: links ("mailto:a%40b.com?subject=Hi", sometimes several addresses), and tel: links.
  // 2b. schema.org microdata: itemprop="email" / "telephone", from content=, href= or the words after the tag.
  scanTags(body, bodyLower, b, (name, tag, _start, end) => {
    if (name === "a") {
      const href = attr(tag, "href");
      if (href && /^mailto:/i.test(href)) {
        const to = safeDecode(href.replace(/^mailto:/i, "").split("?")[0]);
        for (const one of to.split(/[,;]/).slice(0, 10)) add(one, "mailto");
      } else if (href && /^tel:/i.test(href)) {
        addPhone(safeDecode(href.slice(4)));
      }
    }
    if (!tag.toLowerCase().includes("itemprop")) return;
    const prop = (attr(tag, "itemprop") ?? "").trim().toLowerCase();
    if (prop !== "email" && prop !== "telephone") return;
    const nextTag = bodyLower.indexOf("<", end);
    const words = decodeEntities(body.slice(end, nextTag < 0 ? Math.min(body.length, end + 500) : Math.min(nextTag, end + 500)));
    const value = attr(tag, "content") ?? attr(tag, "href") ?? words;
    if (prop === "email") add(value.replace(/^mailto:/i, "").split("?")[0], "schema");
    else addPhone(value.replace(/^tel:/i, ""));
  });

  // 2a. schema.org JSON-LD.
  const blocks = jsonLd(html, html.toLowerCase(), b);
  const ldEmails: string[] = [];
  const ldPhones: string[] = [];
  for (const block of blocks) {
    collect(block, "email", ldEmails);
    collect(block, "telephone", ldPhones);
  }
  for (const e of ldEmails.slice(0, 50)) add(e, "schema");
  for (const p of ldPhones.slice(0, 50)) addPhone(p);
  const microPeople = (body.match(/itemtype\s{0,8}=\s{0,8}["']?https?:\/\/schema\.org\/(Person|Physician)\b/gi) ?? []).length;

  // 3. Written out in the text, with "[at]" / "(at)" / "[dot]" spelled out; looked for one word at a time.
  const text = decodeEntities(dropTags(body)).replace(/\s+/g, " ").trim();
  const unhidden = text
    .replace(/ ?[[({] ?at ?[\])}] ?/gi, "@")
    .replace(/ ?[[({] ?dot ?[\])}] ?/gi, ".");
  for (const word of unhidden.split(" ")) {
    if (b.over()) break;
    if (word.length > MAX_WORD || !word.includes("@")) continue;
    for (const m of word.matchAll(EMAIL_IN_WORD)) add(m[0], "text");
  }

  const providerCount = Math.max(blocks.reduce((n: number, block) => n + countPeople(block), 0), microPeople);
  return { emails, phones, noSolicitation: saysNoSolicitation(text), providerCount };
}

/** The address the page gives for itself (`<link rel="canonical">` or `og:url`), absolute, or null. */
export function extractSelfUrl(page: string, pageUrl: string, opts: { budgetMs?: number } = {}): string | null {
  const body = stripCode(page.slice(0, MAX_HTML));
  let found: string | null = null;
  scanTags(body, body.toLowerCase(), budget(opts.budgetMs), (name, tag) => {
    if (found) return body.length;
    let raw: string | null = null;
    if (name === "link" && /(^|\s)canonical(\s|$)/i.test(attr(tag, "rel") ?? "")) raw = attr(tag, "href");
    else if (name === "meta" && (attr(tag, "property") ?? "").toLowerCase() === "og:url") raw = attr(tag, "content");
    if (!raw) return;
    try {
      const u = new URL(raw.trim(), pageUrl);
      if (u.protocol === "https:" || u.protocol === "http:") found = `${u.origin}/`;
    } catch {
      // not a usable address
    }
  });
  return found;
}

/** Links on the page, as absolute URLs with their words. */
export function extractLinks(page: string, pageUrl: string, opts: { budgetMs?: number } = {}): PageLink[] {
  const links: PageLink[] = [];
  const body = stripCode(page.slice(0, MAX_HTML));
  const lower = body.toLowerCase();
  scanTags(body, lower, budget(opts.budgetMs), (name, tag, _start, end) => {
    if (name !== "a") return;
    const close = closingAt(lower, "a", end);
    if (close < 0) return body.length; // no link after this one has a closing tag either
    const href = attr(tag, "href");
    if (href && !/^(mailto|tel|javascript|data):/i.test(href) && !href.startsWith("#") && links.length < 500) {
      try {
        const url = new URL(href, pageUrl);
        url.hash = "";
        const words = decodeEntities(dropTags(body.slice(end, Math.min(close, end + 2000)))).replace(/\s+/g, " ").trim();
        const label = words || attr(tag, "title") || attr(tag, "aria-label") || "";
        links.push({ url: url.toString(), text: label.slice(0, 200) });
      } catch {
        // not a usable link
      }
    }
    return lower.indexOf(">", close) + 1;
  });
  return links;
}
