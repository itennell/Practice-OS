// What a practice's web page says about how to reach it, read in plain code
// (no HTML library): email addresses from mailto: links, from schema.org data
// (JSON-LD `email`, any @type, and microdata itemprop="email",
// schema.org/email) and written out in the page text, including the
// "name [at] domain [dot] com" style. Phones from JSON-LD `telephone` and tel:
// links. And whether the page asks not to be solicited, in which case Aeon
// uses nothing from the site. Only addresses the page shows are returned:
// nothing is ever guessed from a name.
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", commat: "@", period: ".", lowbar: "_", hyphen: "-" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

const JSON_LD = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;

/** The page without comments, styles and scripts (JSON-LD is read separately). */
function stripCode(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template\s*>/gi, " ");
}

/** The words a visitor sees. */
export function visibleText(html: string): string {
  return decodeEntities(stripCode(html).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const JUNK_LOCAL = new Set(["example", "you", "your", "youremail", "yourname", "name", "email", "username", "someone", "user", "firstname", "first.last"]);
const JUNK_DOMAIN = /(^|\.)(sentry\.io|sentry-next\.wixpress\.com|wixpress\.com|sentry\.wixpress\.com|domain\.com|yourdomain\.com|email\.com|mysite\.com|godaddy\.com|squarespace\.com|wix\.com)$/;
const FILE_ENDING = /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|css|js|mjs|json|pdf|mp4|webm|woff2?|ttf)$/;
const EMAIL = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,24}$/;

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
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
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

function jsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const m of html.matchAll(JSON_LD)) {
    try {
      blocks.push(JSON.parse(m[1].trim()));
    } catch {
      // A broken block is skipped; the rest of the page is still read.
    }
  }
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

export function extractContacts(html: string, pageUrl: string): PageContacts {
  void pageUrl; // kept in the signature so callers pass the page along; relative links don't hold emails
  const emails: FoundEmail[] = [];
  const seen = new Set<string>();
  const add = (raw: string, how: EmailHow) => {
    const v = cleanEmail(raw);
    if (v && !seen.has(v)) {
      seen.add(v);
      emails.push({ value: v, how });
    }
  };
  const phones: string[] = [];
  const addPhone = (raw: string) => {
    const d = phoneDigits(raw);
    if (d && !phones.includes(d)) phones.push(d);
  };

  const body = stripCode(html);

  // 1. mailto: links ("mailto:a%40b.com?subject=Hi", sometimes several addresses).
  for (const m of body.matchAll(/<a\b[^>]*>/gi)) {
    const href = attr(m[0], "href");
    if (!href) continue;
    if (/^mailto:/i.test(href)) {
      const to = safeDecode(href.replace(/^mailto:/i, "").split("?")[0]);
      for (const one of to.split(/[,;]/)) add(one, "mailto");
    } else if (/^tel:/i.test(href)) {
      addPhone(safeDecode(href.slice(4)));
    }
  }

  // 2. schema.org: JSON-LD, then microdata.
  const blocks = jsonLd(html);
  const ldEmails: string[] = [];
  const ldPhones: string[] = [];
  for (const b of blocks) {
    collect(b, "email", ldEmails);
    collect(b, "telephone", ldPhones);
  }
  for (const e of ldEmails) add(e, "schema");
  for (const p of ldPhones) addPhone(p);
  for (const m of body.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bitemprop\s*=\s*["']?(email|telephone)["']?[^>]*>([^<]*)/gi)) {
    const tag = m[0].slice(0, m[0].indexOf(">") + 1);
    const value = attr(tag, "content") ?? attr(tag, "href") ?? decodeEntities(m[3]);
    if (m[2].toLowerCase() === "email") add(value.replace(/^mailto:/i, "").split("?")[0], "schema");
    else addPhone(value.replace(/^tel:/i, ""));
  }
  const microPeople = (body.match(/itemtype\s*=\s*["']?https?:\/\/schema\.org\/(Person|Physician)\b/gi) ?? []).length;

  // 3. Written out in the text, with "[at]" / "(at)" / "[dot]" spelled out.
  const text = visibleText(html);
  const unhidden = text
    .replace(/\s*[[({]\s*at\s*[\])}]\s*/gi, "@")
    .replace(/\s*[[({]\s*dot\s*[\])}]\s*/gi, ".");
  for (const m of unhidden.matchAll(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b/gi)) add(m[0], "text");

  const providerCount = Math.max(blocks.reduce((n: number, b) => n + countPeople(b), 0), microPeople);
  return { emails, phones, noSolicitation: saysNoSolicitation(text), providerCount };
}

/** Links on the page, as absolute URLs with their words. */
export function extractLinks(html: string, pageUrl: string): PageLink[] {
  const links: PageLink[] = [];
  for (const m of stripCode(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const href = attr(`<a ${m[1]}>`, "href");
    if (!href || /^(mailto|tel|javascript|data):/i.test(href) || href.startsWith("#")) continue;
    try {
      const url = new URL(href, pageUrl);
      url.hash = "";
      const words = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      const label = words || attr(`<a ${m[1]}>`, "title") || attr(`<a ${m[1]}>`, "aria-label") || "";
      links.push({ url: url.toString(), text: label });
    } catch {
      // not a usable link
    }
  }
  return links;
}
