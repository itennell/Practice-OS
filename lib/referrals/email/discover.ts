// Finding how to reach a practice from its own website, in plain code. Aeon
// reads robots.txt first, then the home page and at most two of its own pages
// whose link says contact, about, connect or reach (contact first), each only
// if robots.txt allows it. Directories whose terms forbid automated reading
// (Psychology Today, Healthgrades, Zocdoc, Vitals, WebMD) and social sites are
// never read. If any page asks not to be solicited, nothing from the site is
// used. It returns at most one email and one phone, each as a "website" fact
// with the page it was on, and never makes up an address from a name.
import type postgres from "postgres";
import type { Fact } from "../evidence/merge";
import { formatPhone, normalizeName } from "../evidence/normalize";
import { extractContacts, extractLinks, type EmailHow, type PageContacts } from "./extract";
import { politeFetch, type FetchResult } from "./fetch";
import { robotsCheck, robotsDecision, type RobotsDecision } from "./robots";

export const BLOCKLIST = [
  "psychologytoday.com", "healthgrades.com", "zocdoc.com", "vitals.com", "webmd.com",
  "yelp.com", "facebook.com", "instagram.com", "linkedin.com", "google.com",
];
const WEBMAIL = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com",
  "icloud.com", "me.com", "mac.com", "aol.com", "proton.me", "protonmail.com", "pm.me",
]);
const MAX_EXTRA_PAGES = 2;
/** This many different addresses on one page reads as a staff list: Aeon can't tell whose is whose. */
const DIRECTORY_EMAILS = 4;

export type Blocked = null | "blocklisted" | "robots" | "no_solicitation" | "unreachable";
export type DiscoverResult = { facts: Fact[]; pages: string[]; robots: RobotsDecision; blocked: Blocked };
export type DiscoverDeps = {
  fetch?: (url: string) => Promise<FetchResult>;
  now?: () => Date;
  sql?: postgres.Sql;
};

type PageKind = "home" | "contact" | "about";
type Page = { url: string; kind: PageKind; contacts: PageContacts; robots: string };

function bareHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

export function isBlocklisted(host: string): boolean {
  const h = bareHost(host);
  return BLOCKLIST.some((d) => h === d || h.endsWith(`.${d}`));
}

function sameSite(a: string, b: string): boolean {
  return bareHost(a) === bareHost(b);
}

/** The email's domain is the site's own (or one of its subdomains, or the other way round). */
function domainFits(emailDomain: string, siteHost: string): boolean {
  const e = bareHost(emailDomain);
  const s = bareHost(siteHost);
  return e === s || e.endsWith(`.${s}`) || s.endsWith(`.${e}`);
}

function kindOf(link: { url: string; text: string }): PageKind | null {
  const words = `${new URL(link.url).pathname} ${link.text}`.toLowerCase();
  if (/contact|reach|connect/.test(words)) return "contact";
  if (/about/.test(words)) return "about";
  return null;
}

const KIND_LABEL: Record<PageKind, string> = {
  home: "on their home page",
  contact: "on their contact page",
  about: "on their about page",
};

function pathOf(url: string): string {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
}

function ok(r: FetchResult): boolean {
  return !r.error && r.status >= 200 && r.status < 300;
}

export async function discoverContacts(website: string, card: { name: string }, deps: DiscoverDeps = {}): Promise<DiscoverResult> {
  const now = deps.now ?? (() => new Date());
  const fetchPage = deps.fetch ?? ((url: string) => politeFetch(url, { sql: deps.sql, now: () => now().getTime() }));
  const stop = (blocked: Blocked, robots: RobotsDecision, pages: string[] = []): DiscoverResult => ({ facts: [], pages, robots, blocked });

  let site: URL;
  try {
    site = new URL(/^https?:\/\//i.test(website.trim()) ? website.trim() : `https://${website.trim()}`);
    if (site.protocol !== "https:" && site.protocol !== "http:") throw new Error("not a web address");
  } catch {
    return stop("unreachable", { allowed: false, reason: "that isn't a web address Aeon can read" });
  }
  if (isBlocklisted(site.hostname)) {
    return stop("blocklisted", { allowed: false, reason: `Aeon doesn't read ${bareHost(site.hostname)}: its terms don't allow automated reading` });
  }

  // robots.txt first; its answer decides every page after it.
  const robotsRes = await fetchPage(`${site.origin}/robots.txt`);
  const policy = robotsDecision(robotsRes.error ? 0 : robotsRes.status, robotsRes.body);
  const homeUrl = `${site.origin}${site.pathname === "" ? "/" : site.pathname}`;
  const homeRobots = robotsCheck(policy, pathOf(homeUrl));
  if (!homeRobots.allowed) return stop("robots", homeRobots);

  const home = await fetchPage(homeUrl);
  if (!ok(home)) return stop("unreachable", homeRobots);
  // A redirect to another site (a directory, a social page) is not their website.
  const homeHost = new URL(home.finalUrl).hostname;
  if (isBlocklisted(homeHost)) {
    return stop("blocklisted", { allowed: false, reason: `the site sends visitors to ${bareHost(homeHost)}, which Aeon doesn't read` });
  }
  if (!sameSite(homeHost, site.hostname)) return stop("unreachable", homeRobots);

  const pages: Page[] = [{ url: home.finalUrl, kind: "home", contacts: extractContacts(home.body, home.finalUrl), robots: homeRobots.reason }];

  // Up to two of its own pages that say contact / about / connect / reach, contact first.
  const candidates = new Map<string, PageKind>();
  for (const link of extractLinks(home.body, home.finalUrl)) {
    const u = new URL(link.url);
    if (!sameSite(u.hostname, site.hostname) || (u.protocol !== "https:" && u.protocol !== "http:")) continue;
    if (u.toString() === home.finalUrl || u.toString() === homeUrl) continue;
    const kind = kindOf(link);
    if (!kind) continue;
    const before = candidates.get(u.toString());
    if (!before || (before === "about" && kind === "contact")) candidates.set(u.toString(), kind);
  }
  const ranked = [...candidates.entries()].sort((a, b) => (a[1] === b[1] ? 0 : a[1] === "contact" ? -1 : 1));
  for (const [url, kind] of ranked.slice(0, MAX_EXTRA_PAGES)) {
    const allowed = robotsCheck(policy, pathOf(url));
    if (!allowed.allowed) continue;
    const res = await fetchPage(url);
    if (!ok(res) || !sameSite(new URL(res.finalUrl).hostname, site.hostname)) continue;
    pages.push({ url: res.finalUrl, kind, contacts: extractContacts(res.body, res.finalUrl), robots: allowed.reason });
  }

  const read = pages.map((p) => p.url);
  if (pages.some((p) => p.contacts.noSolicitation)) return stop("no_solicitation", homeRobots, read);

  const checkedAt = now().toISOString();
  const facts: Fact[] = [];
  const email = bestEmail(pages, site.hostname, card.name);
  if (email) facts.push(websiteFact("email", email.value, email.page, checkedAt, { how: email.how, unconfirmed: email.unconfirmed, why: email.why }));
  const phone = bestPhone(pages);
  if (phone) facts.push(websiteFact("phone", formatPhone(phone.value), phone.page, checkedAt, {}));
  return { facts, pages: read, robots: homeRobots, blocked: null };
}

type EmailPick = { value: string; how: EmailHow; page: Page; unconfirmed: boolean; why: string | null };

function tier(how: EmailHow, kind: PageKind): number {
  if (how === "mailto" && kind === "contact") return 0;
  if (how === "schema") return 1;
  if (how === "mailto") return 2;
  return kind === "contact" ? 3 : 4;
}

function bestEmail(pages: Page[], siteHost: string, cardName: string): EmailPick | null {
  const lasts = normalizeName(cardName).lasts.filter((l) => l.length >= 3);
  const picks: (EmailPick & { rank: number[] })[] = [];
  for (const page of pages) {
    const directory = page.contacts.emails.length >= DIRECTORY_EMAILS;
    for (const e of page.contacts.emails) {
      const [local, domain] = e.value.split("@");
      const foreign = !WEBMAIL.has(domain) && !domainFits(domain, siteHost);
      const why = directory
        ? "the page lists several addresses, so it isn't clear which is theirs"
        : foreign
          ? `the address is at ${domain}, not their website's domain`
          : null;
      const named = lasts.some((l) => local.replace(/[^a-z]/g, "").includes(l));
      picks.push({ value: e.value, how: e.how, page, unconfirmed: Boolean(why), why, rank: [why ? 1 : 0, named ? 0 : 1, tier(e.how, page.kind)] });
    }
  }
  picks.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
  return picks[0] ?? null;
}

function bestPhone(pages: Page[]): { value: string; page: Page } | null {
  const order: PageKind[] = ["contact", "home", "about"];
  for (const kind of order) {
    for (const page of pages) {
      if (page.kind === kind && page.contacts.phones.length) return { value: page.contacts.phones[0], page };
    }
  }
  return null;
}

function websiteFact(
  field: "email" | "phone",
  value: string,
  page: Page,
  checkedAt: string,
  extra: { how?: EmailHow; unconfirmed?: boolean; why?: string | null },
): Fact {
  const https = page.url.startsWith("https://");
  const where = KIND_LABEL[page.kind];
  const detail: Record<string, unknown> = {
    page: page.url,
    robots: page.robots,
    label: extra.unconfirmed ? `unconfirmed: ${where}, but ${extra.why}` : where,
  };
  if (extra.how) detail.how = extra.how;
  if (extra.unconfirmed) detail.unconfirmed = true;
  return { field, value, origin: "website", originUrl: https ? page.url : null, method: "name_address", checkedAt, detail };
}
