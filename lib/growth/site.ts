// Her one-page practice website, written in plain code from her saved facts
// (lib/media/facts.ts, read only) and her Media answers. A single fast HTML file she
// owns: inline styles, no scripts except the schema.org details block, no fonts or
// images from other sites, and NO tracking pixels or analytics (HHS tracking
// guidance, docs/research.md > Growth agent, section 5; tests/growth-site.test.ts
// enforces it). Logistics only: who she helps by issue, never a client; no
// testimonials; no outcome promises; the 988 line.
//
// Exports: index.html, llms.txt, robots.txt and sitemap.xml as a zip, or the same
// words as plain sections to paste into Squarespace.
import { STATES } from "../compliance/states";
import type { MediaFacts } from "../media/facts";
import { article, feeLine, finalUrl, focusIssues, priceRange, sampleMark, type GrowthSettings } from "./ads";
import { usd } from "./plan";
import { checkText, result, type PolicyCheck, type PolicyFinding } from "./policy";

export const EMERGENCY_LINE = "This site is not for emergencies. If you are in danger, call or text 988, or call 911.";
export const DEMO_LICENSE_LINE = "Dana Reyes, LCPC (fictional demo practice)";

export type SiteSection = { id: string; title: string; paragraphs: string[]; list?: string[] };
export type SiteDraft = {
  url: string;
  title: string;
  description: string;
  bookingHref: string;
  bookingLabel: string;
  licenseLine: string;
  sections: SiteSection[];
  faq: { q: string; a: string }[];
  jsonLd: Record<string, unknown>;
  check: PolicyCheck;
  isSample: boolean;
};

const stateName = (f: MediaFacts) => STATES[f.state] ?? f.state;
/**
 * Her typed words as finished sentences: each sentence starts with a capital, the lone
 * "i" is "I" ("i like" -> "I like", "i'm" -> "I'm"), and it ends with a full stop.
 */
export const sentence = (s: string) => {
  const t = s
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\bi\b(?!\.\w)/g, "I")
    .replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
  return t ? `${t}${/[.!?]$/.test(t) ? "" : "."}` : "";
};

/** Her answer after a lead-in ("How I work: ..."): first letter lowered unless it starts an acronym or "I". */
const afterColon = (s: string) => s.trim().replace(/^([A-Z])(?=[a-z])/, (x) => x.toLowerCase());

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** The license line in her footer. The demo practice always shows exactly the AGENTS.md line. */
export function footerLicenseLine(f: MediaFacts, saved: string | null): string {
  if (f.isSample) return DEMO_LICENSE_LINE;
  return saved?.trim() || `${f.name}, ${f.credential}`;
}

function booking(f: MediaFacts, s: GrowthSettings): { href: string; label: string } {
  const c = f.answers.freeConsultMinutes;
  const label = c ? `Book a free ${c}-minute consult` : "Book a consult";
  if (s.bookingUrl && /^https:\/\//.test(s.bookingUrl)) return { href: s.bookingUrl, label };
  if (f.phone) return { href: `tel:${f.phone.replace(/[^\d+]/g, "")}`, label: `${label}: ${f.phone}` };
  return { href: "#contact", label };
}

/** schema.org MedicalBusiness (a LocalBusiness subtype; schema.org has no counselor type). Never reviews or ratings. */
export function siteJsonLd(f: MediaFacts, url: string): Record<string, unknown> {
  const fee = priceRange(f);
  return {
    "@context": "https://schema.org",
    "@type": "MedicalBusiness",
    "@id": `${url.replace(/\/$/, "")}/#practice`,
    name: f.practiceName,
    url,
    description: `${f.name}, ${f.credential}: therapy in ${[f.neighborhood, f.city].filter(Boolean).join(", ")}${f.telehealth ? ` and by video in ${stateName(f)}` : ""}.`,
    ...(f.phone ? { telephone: f.phone } : {}),
    ...(f.email ? { email: f.email } : {}),
    address: f.address
      ? { "@type": "PostalAddress", streetAddress: f.address.street, addressLocality: f.address.city, addressRegion: f.address.state, postalCode: f.address.zip, addressCountry: "US" }
      : { "@type": "PostalAddress", addressLocality: f.city, addressRegion: f.state, addressCountry: "US" },
    areaServed: f.telehealth ? { "@type": "State", name: stateName(f) } : { "@type": "City", name: f.city },
    ...(fee ? { priceRange: fee } : {}),
    ...(f.inNetwork.length ? { paymentAccepted: ["Cash", "Credit card", ...f.inNetwork.map((p) => `Insurance: ${p}`)].join(", ") } : {}),
    founder: { "@type": "Person", name: f.name, jobTitle: f.credential },
    ...(f.answers.languages ? { knowsLanguage: ["English", ...f.answers.languages.split(/,|\band\b/).map((x) => x.trim()).filter(Boolean)] } : {}),
  };
}

const joinWords = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Who she sees, as plain group words (never a person). */
const GROUPS: { re: RegExp; word: string }[] = [
  { re: /\bolder adults?\b/i, word: "older adults" },
  { re: /\byoung adults?\b/i, word: "young adults" },
  { re: /(?<!older |young )\badults?\b/i, word: "adults" },
  { re: /\b(teens?|teenagers?|adolescents?)\b/i, word: "teens" },
  { re: /\b(children|kids)\b/i, word: "children" },
  { re: /\bcouples?\b/i, word: "couples" },
  { re: /\bfamil(y|ies)\b/i, word: "families" },
];

/** "I work with adults and couples on anxiety, stress and life transitions." Built from service words only. */
export function whoIHelpLine(f: MediaFacts, issues: string[]): string {
  const groups = GROUPS.filter((g) => g.re.test(f.whoIHelp)).map((g) => g.word);
  const topics = issues.filter((i) => i !== "couples" && i !== "family");
  if (!groups.length && !topics.length) return "";
  return sentence(`I work with ${groups.length ? joinWords(groups) : "people"}${topics.length ? ` on ${joinWords(topics)}` : ""}`);
}

export function draftSite(f: MediaFacts, s: GrowthSettings, savedLicenseLine: string | null = null): SiteDraft {
  const url = finalUrl(f, s);
  const fee = feeLine(f);
  const c = f.answers.freeConsultMinutes;
  const where = [f.neighborhood, f.city].filter(Boolean).join(", ");
  const book = booking(f, s);
  const issues = focusIssues(f);
  const sections: SiteSection[] = [
    {
      id: "top",
      title: f.practiceName,
      paragraphs: [
        `Therapy with ${f.name}, ${f.credential}, in ${where}${f.telehealth ? ` and by video anywhere in ${stateName(f)}` : ""}.`,
        c ? `Start with a free ${c}-minute consult call to see if it's a fit.` : "Start with a short consult call to see if it's a fit.",
      ],
    },
    {
      id: "who",
      title: "Who I help",
      // This is the ads' landing page, so it follows the ad rules too: service words in her
      // voice ("I work with adults on anxiety and stress"), never "you" and a condition.
      paragraphs: [whoIHelpLine(f, issues)].filter(Boolean),
    },
    {
      id: "how",
      title: "How it works",
      paragraphs: [
        c ? `1. Book a free ${c}-minute consult. We talk about what you're looking for and whether I'm a good fit.` : "1. Book a consult. We talk about what you're looking for and whether I'm a good fit.",
        `2. Your first session. ${f.answers.firstSession ? sentence(f.answers.firstSession) : "We talk about what brought you in and what you hope will change."}`,
        "3. After that, we meet on a schedule that works for you.",
        ...(f.answers.approach ? [sentence(`How I work: ${afterColon(f.answers.approach)}`)] : []),
      ],
    },
    {
      id: "fees",
      title: "Fees and insurance",
      paragraphs: [
        ...(fee ? [`${f.inNetwork.length ? "Sessions" : "Private-pay sessions"} are ${fee}.`] : []),
        ...f.fees
          .filter((x) => /\b(intake|first session)\b/i.test(x.label))
          .map((x) => `${sampleMark(f)}${x.label.replace(/\[sample\]\s*/gi, "").replace(/^\d{5}\s+/, "").replace(/\s*\(.*\)$/, "").trim()}: ${usd(x.cents)}.`),
        "I can give you a superbill: a receipt you send to your insurance to ask for out-of-network reimbursement.",
        f.inNetwork.length ? `I'm in network with ${f.inNetwork.join(" and ")}.` : "I'm not in network with insurance plans yet.",
        "You'll get a Good Faith Estimate of your costs before your first session.",
      ],
    },
    {
      id: "where",
      title: "Location",
      paragraphs: [
        f.address ? `In person: ${f.address.street}, ${f.address.city}, ${f.address.state} ${f.address.zip}.` : `In person in ${where}.`,
        ...(f.telehealth ? [`By video: anywhere in ${stateName(f)}.`] : []),
      ],
    },
    {
      id: "about",
      title: `About ${f.name}`,
      paragraphs: [
        `${f.name} is ${article(f.credential)} ${f.credential} in ${f.city}${f.answers.yearsInPractice ? ` with ${f.answers.yearsInPractice} years in practice` : ""}.`,
        ...(f.answers.why ? [sentence(`Why I do this work: ${afterColon(f.answers.why)}`)] : []),
        ...f.education.map((e) => sentence(e)),
        ...(f.answers.languages ? [`I see clients in English and ${f.answers.languages}.`] : []),
      ],
    },
  ];
  const faq = [
    { q: "How do I start?", a: c ? `Book a free ${c}-minute consult call. If it's a fit, we set up a first session.` : "Book a consult call. If it's a fit, we set up a first session." },
    ...(fee ? [{ q: "How much does it cost?", a: `${f.inNetwork.length ? "Sessions" : "Private-pay sessions"} are ${fee}. You'll get a Good Faith Estimate first.` }] : []),
    { q: "Do you take insurance?", a: f.inNetwork.length ? `I'm in network with ${f.inNetwork.join(" and ")}. For other plans I give superbills for out-of-network claims.` : "I give superbills you can send to your insurance for out-of-network claims." },
    ...(f.telehealth ? [{ q: "Can we meet by video?", a: `Yes, anywhere in ${stateName(f)}.` }] : []),
    { q: "Is this for emergencies?", a: "No. If you are in danger, call or text 988, or call 911." },
  ];
  const title = `${f.practiceName} | Therapy in ${f.neighborhood ?? f.city}`;
  const description = `${f.name}, ${f.credential}. Therapy in ${where}${f.telehealth ? ` and by video in ${stateName(f)}` : ""}.${c ? ` Free ${c}-minute consult.` : ""}`;
  const body = { url, title, description, bookingHref: book.href, bookingLabel: book.label, licenseLine: footerLicenseLine(f, savedLicenseLine), sections, faq, jsonLd: siteJsonLd(f, url), isSample: f.isSample };
  return { ...body, check: checkSite(body, f) };
}

export function checkSite(d: Omit<SiteDraft, "check">, f: MediaFacts | null): PolicyCheck {
  // The site is the ads' landing page: the top and "Who I help" follow the ad rules in full,
  // including the personal-attribute rule. The rest may use her own words about how she works.
  const strict = new Set(["top", "who"]);
  const site = (text: string, where: string) => checkText(text, where, null, f).filter((x) => x.rule !== "personal_attribute");
  const out: PolicyFinding[] = [];
  for (const s of d.sections)
    for (const p of [...s.paragraphs, ...(s.list ?? [])]) out.push(...(strict.has(s.id) ? checkText(p, s.title, null, f) : site(p, s.title)));
  // Page-wide text: never a license number or a claim, in the footer, title, description or button.
  out.push(...site(d.licenseLine, "license line"), ...site(d.title, "page title"), ...checkText(d.description, "page description", null, f), ...checkText(d.bookingLabel, "booking button", null, f));
  for (const q of d.faq) {
    if (q.q === "Is this for emergencies?") continue; // the fixed 988 line, word for word
    out.push(...site(`${q.q} ${q.a}`, "FAQ"));
  }
  out.push(...trackerFindings(renderSiteHtml({ ...d, check: { ok: true, findings: [], checkedAt: "" } })));
  return result(out);
}

// ---- no tracking --------------------------------------------------------------------

const TRACKERS = /googletagmanager|google-analytics|gtag\(|fbq\(|connect\.facebook\.net|facebook\.com\/tr|analytics|hotjar|clarity\.ms|segment\.(io|com)|mixpanel|doubleclick|tiktok|pixel|plausible|umami|matomo/i;

/** Anything in the page that loads or sends something to another site. */
export function trackerFindings(html: string): PolicyFinding[] {
  const out: PolicyFinding[] = [];
  const add = (message: string) => out.push({ rule: "lint", severity: "block", where: "page code", message });
  if (TRACKERS.test(html)) add("Has a tracking or analytics script.");
  if (/<script(?![^>]*type=["']application\/ld\+json["'])[^>]*>/i.test(html)) add("Has a script other than the practice details block.");
  if (/<script[^>]*\ssrc=/i.test(html)) add("Loads a script from another site.");
  if (/<(img|iframe|object|embed|video|audio|source)\b[^>]*\s(src|data)=["']https?:/i.test(html)) add("Loads a file from another site.");
  // A canonical link names her own address and loads nothing; any other <link> to a site (fonts, styles) does.
  if (/<link\b(?![^>]*rel=["']canonical["'])[^>]*\shref=["']https?:/i.test(html)) add("Loads a file from another site.");
  if (/<form\b/i.test(html)) add("Has a form. Contact stays phone, email or a booking link.");
  return out;
}

// ---- rendering ----------------------------------------------------------------------

const CSS = `:root{color-scheme:light dark;--bg:#FAF9F5;--card:#FFFFFF;--ink:#1F1E1D;--muted:#65635C;--line:#E3E1D9;--accent:#5B47C9}
@media (prefers-color-scheme:dark){:root{--bg:#262624;--card:#30302E;--ink:#F5F4EF;--muted:#B5B3AB;--line:#3E3D3A;--accent:#B0A3FB}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Inter,sans-serif}
main,header,footer{max-width:760px;margin:0 auto;padding:0 20px}header{padding-top:56px;padding-bottom:24px}
h1{font-size:2.2rem;line-height:1.15;margin:0 0 12px}h2{font-size:1.35rem;margin:0 0 8px}p{margin:0 0 10px}
section{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:24px;margin:0 0 16px}
.cta{display:inline-flex;align-items:center;min-height:52px;padding:0 28px;border-radius:999px;background:var(--ink);color:var(--bg);font-weight:600;text-decoration:none;margin-top:8px}
.cta:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:3px}a{color:var(--accent)}
ul{margin:8px 0 0;padding-left:20px}dt{font-weight:600;margin-top:12px}dd{margin:0}
.muted{color:var(--muted)}.sample{background:var(--line);text-align:center;padding:8px;font-size:15px}footer{padding:24px 20px 56px;font-size:15px}`;

export function renderSiteHtml(d: SiteDraft): string {
  const e = escapeHtml;
  const [hero, ...rest] = d.sections;
  const section = (s: SiteSection) =>
    `<section id="${e(s.id)}" aria-labelledby="${e(s.id)}-h"><h2 id="${e(s.id)}-h">${e(s.title)}</h2>${s.paragraphs.map((p) => `<p>${e(p)}</p>`).join("")}${s.list?.length ? `<ul>${s.list.map((x) => `<li>${e(x)}</li>`).join("")}</ul>` : ""}</section>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(d.title)}</title>
<meta name="description" content="${e(d.description)}">
<link rel="canonical" href="${e(d.url)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(d.title)}">
<meta property="og:description" content="${e(d.description)}">
<meta property="og:url" content="${e(d.url)}">
${d.isSample ? '<meta name="robots" content="noindex">\n' : ""}<style>${CSS}</style>
<script type="application/ld+json">${JSON.stringify(d.jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body>
${d.isSample ? '<p class="sample">[Sample] Fictional demo practice. Not a real therapist.</p>\n' : ""}<header>
<h1>${e(hero.title)}</h1>
${hero.paragraphs.map((p) => `<p>${e(p)}</p>`).join("\n")}
<a class="cta" href="${e(d.bookingHref)}">${e(d.bookingLabel)}</a>
</header>
<main>
${rest.map(section).join("\n")}
<section id="faq" aria-labelledby="faq-h"><h2 id="faq-h">Questions</h2><dl>${d.faq.map((q) => `<dt>${e(q.q)}</dt><dd>${e(q.a)}</dd>`).join("")}</dl></section>
<section id="contact" aria-labelledby="contact-h"><h2 id="contact-h">Book a consult</h2><p><a class="cta" href="${e(d.bookingHref)}">${e(d.bookingLabel)}</a></p><p class="muted">Please don't send health details by email. ${e(EMERGENCY_LINE)}</p></section>
</main>
<footer><p>${e(d.licenseLine)}</p><p class="muted">${e(EMERGENCY_LINE)}</p></footer>
</body>
</html>
`;
}

/** llms.txt (llmstxt.org): a short plain summary for AI search tools. */
export function renderLlmsTxt(d: SiteDraft): string {
  const lines = [`# ${d.sections[0].title}`, "", `> ${d.description}`, ""];
  for (const s of d.sections.slice(1)) lines.push(`## ${s.title}`, "", ...s.paragraphs.map((p) => `- ${p}`), ...(s.list ?? []).map((x) => `- ${x}`), "");
  lines.push("## Questions", "", ...d.faq.map((q) => `- ${q.q} ${q.a}`), "", `## Book`, "", `- [${d.bookingLabel}](${d.bookingHref})`, "", d.licenseLine, "");
  return lines.join("\n");
}

export function renderRobotsTxt(d: SiteDraft): string {
  if (d.isSample) return "User-agent: *\nDisallow: /\n";
  return `User-agent: *\nAllow: /\n\nSitemap: ${d.url.replace(/\/$/, "")}/sitemap.xml\n`;
}

export function renderSitemap(d: SiteDraft, today: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${escapeHtml(d.url.replace(/\/?$/, "/"))}</loc><lastmod>${today}</lastmod></url>\n</urlset>\n`;
}

/** The same words as plain sections, to paste into Squarespace text blocks one by one. */
export function renderSquarespaceText(d: SiteDraft): string {
  const out = [d.isSample ? "[Sample] Fictional demo practice.\n" : "", "Paste each section into its own Text block in Squarespace. Put the booking button on Home and Contact.", ""];
  for (const s of d.sections) out.push(`=== ${s.title} ===`, ...s.paragraphs, ...(s.list ?? []).map((x) => `- ${x}`), "");
  out.push("=== Questions ===", ...d.faq.flatMap((q) => [q.q, q.a, ""]), "=== Book a consult ===", `${d.bookingLabel}: ${d.bookingHref}`, EMERGENCY_LINE, "", "=== Footer ===", d.licenseLine, "");
  out.push("=== Practice details block for Google (Settings > Advanced > Code Injection > Header) ===", `<script type="application/ld+json">${JSON.stringify(d.jsonLd).replace(/</g, "\\u003c")}</script>`, "");
  return out.join("\n");
}

export function siteFiles(d: SiteDraft, today: string): { name: string; data: string }[] {
  return [
    { name: "index.html", data: renderSiteHtml(d) },
    { name: "llms.txt", data: renderLlmsTxt(d) },
    { name: "robots.txt", data: renderRobotsTxt(d) },
    { name: "sitemap.xml", data: renderSitemap(d, today) },
  ];
}
