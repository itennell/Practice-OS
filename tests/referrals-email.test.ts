// Reading a practice's own website for an email and phone: robots.txt by RFC
// 9309, the polite fetcher (no private addresses, redirects, cache, spacing),
// what a page says, and the whole discovery with a fake fetch. No network.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { discoverContacts } from "../lib/referrals/email/discover";
import { extractContacts, extractLinks, saysNoSolicitation } from "../lib/referrals/email/extract";
import { politeFetch, resetPoliteFetch, unsafeUrlReason, USER_AGENT, type FetchResult } from "../lib/referrals/email/fetch";
import { parseRobots, robotsAllows, robotsCheck, robotsDecision } from "../lib/referrals/email/robots";

const site = (name: string) => readFileSync(join(__dirname, "fixtures/referrals/sites", name), "utf8");

describe("robots.txt (RFC 9309)", () => {
  it("uses the group naming Practice-OS (any case, merged) over *", () => {
    const rules = parseRobots(`
User-agent: *
Disallow: /

User-agent: practice-os
Disallow: /private

User-agent: OtherBot
User-agent: PRACTICE-OS/0.1
Disallow: /secret
`);
    expect(robotsAllows(rules, "/contact")).toBe(true);
    expect(robotsAllows(rules, "/private/x")).toBe(false);
    expect(robotsAllows(rules, "/secret")).toBe(false);
    expect(robotsAllows(rules, "/contact", "SomeoneElse")).toBe(false);
  });

  it("falls back to *, and allows everything with no matching group", () => {
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /contact"), "/contact")).toBe(false);
    expect(robotsAllows(parseRobots("User-agent: Googlebot\nDisallow: /"), "/contact")).toBe(true);
    expect(robotsAllows(parseRobots(""), "/anything")).toBe(true);
  });

  it("lets the longest match win, Allow on a tie, and keeps case", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /pages\nAllow: /pages/contact\nDisallow: /tie\nAllow: /tie");
    expect(robotsAllows(rules, "/pages/about")).toBe(false);
    expect(robotsAllows(rules, "/pages/contact")).toBe(true);
    expect(robotsAllows(rules, "/tie")).toBe(true);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /Contact"), "/contact")).toBe(true);
  });

  it("understands * and $", () => {
    const rules = parseRobots("User-agent: *\nDisallow: /*.pdf$\nDisallow: /team/*/email\nDisallow: /exact$");
    expect(robotsAllows(rules, "/forms/intake.pdf")).toBe(false);
    expect(robotsAllows(rules, "/forms/intake.pdf?x=1")).toBe(true);
    expect(robotsAllows(rules, "/team/ana/email")).toBe(false);
    expect(robotsAllows(rules, "/exact")).toBe(false);
    expect(robotsAllows(rules, "/exactly")).toBe(true);
    expect(robotsAllows(parseRobots("User-agent: *\nDisallow: /"), "/robots.txt")).toBe(true);
  });

  it("ignores lines past 500 KiB", () => {
    const text = `User-agent: *\n${"# filler\n".repeat(70_000)}Disallow: /contact\n`;
    expect(robotsAllows(parseRobots(text), "/contact")).toBe(true);
  });

  it("treats 4xx as no robots.txt and 5xx or no answer as stay out, in plain words", () => {
    expect(robotsCheck(robotsDecision(404), "/contact")).toEqual({ allowed: true, reason: "the site has no robots.txt" });
    expect(robotsCheck(robotsDecision(503), "/").allowed).toBe(false);
    expect(robotsCheck(robotsDecision(0), "/").allowed).toBe(false);
    expect(robotsCheck(robotsDecision(200, "User-agent: *\nDisallow: /contact"), "/contact")).toEqual({
      allowed: false,
      reason: "robots.txt disallows /contact",
    });
    expect(robotsCheck(robotsDecision(200, ""), "/contact").reason).toBe("robots.txt allows /contact");
  });
});

describe("what a page says", () => {
  it("reads mailto links, decoding %40 and dropping ?subject", () => {
    const c = extractContacts(site("contact.html"), "https://reyescounseling.example/p/42");
    expect(c.emails).toEqual([{ value: "dana.reyes@reyescounseling.example", how: "mailto" }]);
    expect(c.phones).toEqual(["3125550199"]);
  });

  it("reads JSON-LD email and telephone anywhere in an @graph, and counts the people", () => {
    const c = extractContacts(site("jsonld.html"), "https://elmstreetfm.example/");
    expect(c.emails.map((e) => e.value)).toEqual(["office@elmstreetfm.example", "referrals@elmstreetfm.example"]);
    expect(c.emails.every((e) => e.how === "schema")).toBe(true);
    expect(c.phones).toEqual(["7735550110", "7735550111"]);
    expect(c.providerCount).toBe(2);
  });

  it("reads microdata itemprop=email and telephone", () => {
    const c = extractContacts(site("microdata.html"), "https://morgan-lcsw.test/");
    expect(c.emails).toContainEqual({ value: "intake@morgan-lcsw.test", how: "schema" });
    expect(c.emails.map((e) => e.value)).toContain("pat@morgan-lcsw.test");
    expect(c.phones).toEqual(["7085550123"]);
    expect(c.providerCount).toBe(1);
  });

  it("reads [at] / (at) / [dot] spelled out in the text", () => {
    const c = extractContacts(site("about.html"), "https://reyescounseling.example/about-dana");
    expect(c.emails).toEqual([
      { value: "office@reyescounseling.example", how: "text" },
      { value: "hello@reyescounseling.example", how: "text" },
    ]);
  });

  it("drops junk: placeholders, image names, tracking addresses in scripts, duplicates", () => {
    const c = extractContacts(site("junk.html"), "https://reyescounseling.example/");
    expect(c.emails.map((e) => e.value)).toEqual(["frontdesk@reyescounseling.example", "billing@reyescounseling.example"]);
    const home = extractContacts(site("home.html"), "https://reyescounseling.example/");
    expect(home.emails).toEqual([]);
    expect(home.phones).toEqual(["3125550142"]);
    expect(extractContacts(`<p>${"a".repeat(250)}@x.example</p>`, "https://x.example/").emails).toEqual([]);
  });

  it("notices a page that asks not to be solicited", () => {
    expect(extractContacts(site("no-solicit.html"), "https://lakeview-therapy.example/contact").noSolicitation).toBe(true);
    for (const t of ["No solicitations, please", "Do not solicit this office", "NO SOLICITING", "Unsolicited messages are not welcome", "We do not accept marketing calls"]) {
      expect(saysNoSolicitation(t)).toBe(true);
    }
    expect(saysNoSolicitation("We welcome referrals from physicians.")).toBe(false);
    expect(extractContacts(`<script>var s="no solicitation"</script><p>hi</p>`, "https://x.example/").noSolicitation).toBe(false);
  });

  it("lists links with their words, as full addresses", () => {
    const links = extractLinks(site("home.html"), "https://reyescounseling.example/");
    expect(links).toContainEqual({ url: "https://reyescounseling.example/p/42", text: "Contact" });
  });
});

// A pretend web: url -> answer. Anything not listed is a 404.
type Answer = { status?: number; body?: string; finalUrl?: string; error?: string };
function fakeWeb(pages: Record<string, Answer | string>) {
  const asked: string[] = [];
  const fetch = async (url: string): Promise<FetchResult> => {
    asked.push(url);
    const a = pages[url];
    if (a === undefined) return { url, finalUrl: url, status: 404, body: "", fromCache: false };
    const ans: Answer = typeof a === "string" ? { body: a } : a;
    return { url, finalUrl: ans.finalUrl ?? url, status: ans.error ? 0 : (ans.status ?? 200), body: ans.body ?? "", fromCache: false, error: ans.error };
  };
  return { fetch, asked };
}

const NOW = () => new Date("2026-10-29T12:00:00Z");
const DANA = { name: "Dana Reyes, LCPC" };
const R = "https://reyescounseling.example";

describe("discoverContacts", () => {
  it("finds the contact page by its link text and prefers its mailto", async () => {
    const web = fakeWeb({ [`${R}/`]: site("home.html"), [`${R}/p/42`]: site("contact.html"), [`${R}/about-dana`]: site("about.html") });
    const r = await discoverContacts("reyescounseling.example", DANA, { fetch: web.fetch, now: NOW });
    expect(r.blocked).toBeNull();
    expect(web.asked[0]).toBe(`${R}/robots.txt`);
    expect(r.pages).toEqual([`${R}/`, `${R}/p/42`, `${R}/about-dana`]);
    expect(web.asked).not.toContain(`${R}/blog`);
    const email = r.facts.find((f) => f.field === "email")!;
    expect(email).toMatchObject({
      value: "dana.reyes@reyescounseling.example",
      origin: "website",
      method: "name_address",
      originUrl: `${R}/p/42`,
      checkedAt: "2026-10-29T12:00:00.000Z",
      detail: { page: `${R}/p/42`, how: "mailto", label: "on their contact page", robots: "the site has no robots.txt" },
    });
    expect(email.detail?.unconfirmed).toBeUndefined();
    expect(r.facts.find((f) => f.field === "phone")).toMatchObject({ value: "312-555-0199", detail: { label: "on their contact page" } });
    expect(r.facts).toHaveLength(2);
  });

  it("skips a page robots.txt disallows and reads only the home page", async () => {
    const web = fakeWeb({
      [`${R}/robots.txt`]: "User-agent: *\nDisallow: /p/\nDisallow: /about",
      [`${R}/`]: site("home.html"),
      [`${R}/p/42`]: site("contact.html"),
    });
    const r = await discoverContacts(`${R}/`, DANA, { fetch: web.fetch, now: NOW });
    expect(r.pages).toEqual([`${R}/`]);
    expect(web.asked).toEqual([`${R}/robots.txt`, `${R}/`]);
    expect(r.robots).toEqual({ allowed: true, reason: "robots.txt allows /" });
    expect(r.facts).toEqual([expect.objectContaining({ field: "phone", value: "312-555-0142", detail: expect.objectContaining({ label: "on their home page" }) })]);
  });

  it("stays out when robots.txt disallows the home page or can't be read", async () => {
    const no = await discoverContacts(R, DANA, { fetch: fakeWeb({ [`${R}/robots.txt`]: "User-agent: practice-os\nDisallow: /" }).fetch, now: NOW });
    expect(no).toMatchObject({ blocked: "robots", facts: [], robots: { allowed: false } });
    const down = await discoverContacts(R, DANA, { fetch: fakeWeb({ [`${R}/robots.txt`]: { status: 503 } }).fetch, now: NOW });
    expect(down.blocked).toBe("robots");
  });

  it("returns no facts at all when any page asks not to be solicited", async () => {
    const L = "https://lakeview-therapy.example";
    const web = fakeWeb({ [`${L}/`]: `<a href="/contact">Reach us</a><a href="tel:3125550100">call</a>`, [`${L}/contact`]: site("no-solicit.html") });
    const r = await discoverContacts(L, { name: "Lee Park, LCSW" }, { fetch: web.fetch, now: NOW });
    expect(r.blocked).toBe("no_solicitation");
    expect(r.facts).toEqual([]);
  });

  it("never reads a blocklisted directory or social site, subdomains included", async () => {
    for (const url of ["https://www.psychologytoday.com/us/therapists/x", "https://m.facebook.com/somepractice", "zocdoc.com/doctor/x"]) {
      const web = fakeWeb({});
      const r = await discoverContacts(url, DANA, { fetch: web.fetch, now: NOW });
      expect(r.blocked).toBe("blocklisted");
      expect(web.asked).toEqual([]);
    }
  });

  it("marks an email from a staff page with 4 or more addresses unconfirmed", async () => {
    const N = "https://northside-group.example";
    const web = fakeWeb({ [`${N}/`]: `<a href="/about-us">About us</a>`, [`${N}/about-us`]: site("directory.html") });
    const r = await discoverContacts(N, { name: "Ben Ortiz, PsyD" }, { fetch: web.fetch, now: NOW });
    const email = r.facts.find((f) => f.field === "email")!;
    expect(email.value).toBe("ana@northside-group.example");
    expect(email.detail).toMatchObject({ unconfirmed: true, label: expect.stringMatching(/^unconfirmed: on their about page/) });
  });

  it("marks an address at another company's domain unconfirmed", async () => {
    const web = fakeWeb({ [`${R}/`]: `<a href="/contact">Contact</a>`, [`${R}/contact`]: site("other-domain.html") });
    const r = await discoverContacts(R, DANA, { fetch: web.fetch, now: NOW });
    expect(r.facts[0]).toMatchObject({ value: "dana@billing-partners.example", detail: { unconfirmed: true } });
    expect(String(r.facts[0].detail?.label)).toContain("billing-partners.example");
  });

  it("accepts a webmail address as theirs", async () => {
    const B = "https://riverbend-counseling.example";
    const web = fakeWeb({ [`${B}/`]: `<a href="/contact-us">Say hello</a>`, [`${B}/contact-us`]: site("gmail.html") });
    const r = await discoverContacts(B, { name: "Riley Bend" }, { fetch: web.fetch, now: NOW });
    expect(r.facts[0]).toMatchObject({ value: "riverbend.counseling@gmail.com", detail: { label: "on their contact page" } });
    expect(r.facts[0].detail?.unconfirmed).toBeUndefined();
  });

  it("prefers an address with the card's last name, and a confirmed one over an unconfirmed one", async () => {
    const web = fakeWeb({
      [`${R}/`]: `<a href="/contact">Contact</a>`,
      [`${R}/contact`]: `<a href="mailto:office@reyescounseling.example">o</a> <a href="mailto:dreyes@reyescounseling.example">d</a> <a href="mailto:reyes@other.example">x</a>`,
    });
    const r = await discoverContacts(R, DANA, { fetch: web.fetch, now: NOW });
    expect(r.facts[0].value).toBe("dreyes@reyescounseling.example");
  });

  it("keeps an http page out of originUrl but in the detail", async () => {
    const H = "http://oldsite.example";
    const web = fakeWeb({ [`${H}/`]: `<a href="mailto:hi@oldsite.example">Email</a>` });
    const r = await discoverContacts(H, DANA, { fetch: web.fetch, now: NOW });
    expect(r.facts[0]).toMatchObject({ originUrl: null, detail: { page: `${H}/`, label: "on their home page" } });
  });

  it("calls the site unreachable when the home page doesn't answer", async () => {
    const r = await discoverContacts(R, DANA, { fetch: fakeWeb({ [`${R}/`]: { error: "the site took too long to answer" } }).fetch, now: NOW });
    expect(r).toMatchObject({ blocked: "unreachable", facts: [] });
  });
});

// A pretend fetch for politeFetch: every call recorded with its headers.
type Call = { url: string; headers: Record<string, string> };
function fakeFetch(answer: (url: string, headers: Record<string, string>) => Response) {
  const calls: Call[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ url, headers });
    return answer(url, headers);
  }) as typeof fetch;
  return { fetcher, calls };
}
const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8", ...headers } });
const publicDns = async () => ["93.184.216.34"];
const noSleep = async () => {};

describe("politeFetch", () => {
  beforeEach(() => resetPoliteFetch());

  it("refuses private, loopback and odd addresses before asking anything", async () => {
    for (const url of [
      "http://localhost/", "http://127.0.0.1/", "http://10.0.0.5/", "http://192.168.1.1/", "http://169.254.169.254/latest",
      "http://[::1]/", "http://printer.local/", "https://svc.internal/", "ftp://files.example/", "http://intranet/",
      "https://user:pw@site.example/", "https://site.example:8080/",
    ]) {
      expect(unsafeUrlReason(url), url).not.toBeNull();
    }
    const { fetcher, calls } = fakeFetch(() => html("x"));
    const r = await politeFetch("http://127.0.0.1/", { fetcher, lookup: publicDns, sleep: noSleep });
    expect(r).toMatchObject({ status: 0, error: expect.stringMatching(/^refused/) });
    expect(calls).toHaveLength(0);
  });

  it("refuses a public name that points at a private address", async () => {
    const { fetcher, calls } = fakeFetch(() => html("x"));
    const r = await politeFetch("https://sneaky.example/", { fetcher, lookup: async () => ["10.1.2.3"], sleep: noSleep });
    expect(r.error).toMatch(/^refused/);
    expect(calls).toHaveLength(0);
  });

  it("sends the honest User-Agent and follows up to 5 redirects, checking each", async () => {
    const { fetcher, calls } = fakeFetch((url) => {
      const n = Number(new URL(url).pathname.slice(1) || 0);
      return n < 5 ? new Response(null, { status: 301, headers: { location: `/${n + 1}` } }) : html("<p>done</p>");
    });
    const r = await politeFetch("https://hops.example/", { fetcher, lookup: publicDns, sleep: noSleep });
    expect(r).toMatchObject({ status: 200, body: "<p>done</p>", finalUrl: "https://hops.example/5" });
    expect(calls[0].headers["User-Agent"]).toBe(USER_AGENT);
    expect(calls).toHaveLength(6);
  });

  it("stops after too many redirects, and at a redirect into a private address", async () => {
    const loop = fakeFetch((url) => new Response(null, { status: 302, headers: { location: `${url}x` } }));
    const r = await politeFetch("https://loop.example/", { fetcher: loop.fetcher, lookup: publicDns, sleep: noSleep });
    expect(r.error).toBe("too many redirects");
    expect(loop.calls).toHaveLength(6);
    const sneaky = fakeFetch(() => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/admin" } }));
    const s = await politeFetch("https://hop.example/", { fetcher: sneaky.fetcher, lookup: publicDns, sleep: noSleep });
    expect(s.error).toMatch(/^refused/);
    expect(sneaky.calls).toHaveLength(1);
  });

  it("reads only web pages, at most 600 KB", async () => {
    const big = fakeFetch(() => html("a".repeat(700_000)));
    expect((await politeFetch("https://big.example/", { fetcher: big.fetcher, lookup: publicDns, sleep: noSleep })).body).toHaveLength(600_000);
    const img = fakeFetch(() => new Response("PNG", { status: 200, headers: { "content-type": "image/png" } }));
    expect(await politeFetch("https://img.example/x", { fetcher: img.fetcher, lookup: publicDns, sleep: noSleep })).toMatchObject({ body: "", error: "not a web page" });
  });

  it("answers from the cache, then asks 'changed?' with the ETag and uses the cache on 304", async () => {
    let t = Date.parse("2026-10-29T12:00:00Z");
    const now = () => t;
    const { fetcher, calls } = fakeFetch((_url, headers) =>
      headers["If-None-Match"] === '"v1"' ? new Response(null, { status: 304 }) : html("<p>v1</p>", { etag: '"v1"', "last-modified": "Wed, 28 Oct 2026 10:00:00 GMT" }),
    );
    const opts = { fetcher, now, lookup: publicDns, sleep: noSleep };
    expect(await politeFetch("https://cache.example/contact", opts)).toMatchObject({ body: "<p>v1</p>", fromCache: false });
    expect(await politeFetch("https://cache.example/contact", opts)).toMatchObject({ body: "<p>v1</p>", fromCache: true });
    expect(calls).toHaveLength(1); // still fresh: no request
    t += 8 * 24 * 60 * 60 * 1000; // a page is kept a week
    expect(await politeFetch("https://cache.example/contact", opts)).toMatchObject({ status: 200, body: "<p>v1</p>", fromCache: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].headers).toMatchObject({ "If-None-Match": '"v1"', "If-Modified-Since": "Wed, 28 Oct 2026 10:00:00 GMT" });
  });

  it("keeps robots.txt for a day only", async () => {
    let t = 0;
    const { fetcher, calls } = fakeFetch(() => new Response("User-agent: *", { status: 200, headers: { "content-type": "text/plain" } }));
    const opts = { fetcher, now: () => t, lookup: publicDns, sleep: noSleep };
    await politeFetch("https://r.example/robots.txt", opts);
    t += 23 * 60 * 60 * 1000;
    await politeFetch("https://r.example/robots.txt", opts);
    expect(calls).toHaveLength(1);
    t += 2 * 60 * 60 * 1000;
    await politeFetch("https://r.example/robots.txt", opts);
    expect(calls).toHaveLength(2);
  });

  it("waits at least a second between requests to the same site, not across sites", async () => {
    const waits: number[] = [];
    const sleep = async (ms: number) => {
      waits.push(ms);
    };
    const { fetcher } = fakeFetch(() => html("ok"));
    const opts = { fetcher, now: () => 5_000, lookup: publicDns, sleep };
    await politeFetch("https://space.example/a", opts);
    await politeFetch("https://space.example/b", opts);
    await politeFetch("https://space.example/c", opts);
    await politeFetch("https://elsewhere.example/a", opts);
    expect(waits).toEqual([1000, 2000]);
  });

  it("reports a site that doesn't answer as status 0 with plain words", async () => {
    const fetcher = (async () => {
      throw new Error("ECONNREFUSED");
    }) as typeof fetch;
    const r = await politeFetch("https://down.example/", { fetcher, lookup: publicDns, sleep: noSleep });
    expect(r).toMatchObject({ status: 0, error: expect.stringContaining("couldn't be reached") });
  });
});
