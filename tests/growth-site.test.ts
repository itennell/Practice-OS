// Her one-page website: no tracking pixels or analytics, valid schema.org JSON-LD,
// the demo license line, no testimonials or promises, and a real zip.
import { describe, expect, it } from "vitest";
import type { GrowthSettings } from "../lib/growth/ads";
import { checkSite, DEMO_LICENSE_LINE, draftSite, renderLlmsTxt, renderRobotsTxt, renderSitemap, renderSiteHtml, renderSquarespaceText, siteFiles, trackerFindings } from "../lib/growth/site";
import { crc32, makeZip } from "../lib/growth/zip";
import { DANA } from "./media-fixtures";

const S: GrowthSettings = { siteUrl: null, bookingUrl: "https://cal.example.com/dana/consult", monthlyCapCents: null, radiusMiles: 5 };
const d = draftSite(DANA, S, "ignored for the demo");
const html = renderSiteHtml(d);

describe("one-page website", () => {
  it("passes its own policy check", () => {
    expect(d.check.findings.filter((f) => f.severity === "block")).toEqual([]);
    expect(d.check.ok).toBe(true);
  });

  it("has no tracking pixels, analytics or outside scripts", () => {
    expect(trackerFindings(html)).toEqual([]);
    const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)].map((m) => m[1]);
    expect(scripts).toEqual([' type="application/ld+json"']);
    expect(html).not.toMatch(/googletagmanager|gtag\(|fbq\(|connect\.facebook\.net|google-analytics|<img|<iframe|<form/i);
    expect(html).not.toMatch(/\s(src|href)=["']https?:\/\/(?!www\.example\.com|cal\.example\.com)/i);
  });

  it("the no-pixel check catches a pasted tracker", () => {
    expect(trackerFindings(html.replace("</head>", '<script async src="https://www.googletagmanager.com/gtag/js?id=G-X"></script></head>')).length).toBeGreaterThan(0);
    expect(trackerFindings(html.replace("</body>", "<script>fbq('init','1')</script></body>")).length).toBeGreaterThan(0);
    expect(trackerFindings(html.replace("</body>", '<img src="https://www.facebook.com/tr?id=1" width="1" height="1"></body>')).length).toBeGreaterThan(0);
  });

  it("has valid JSON-LD for a counseling practice, with no reviews or ratings", () => {
    const m = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    const ld = JSON.parse(m![1]);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("MedicalBusiness");
    expect(ld).toMatchObject({ name: "Reyes Counseling PLLC", telephone: "312-555-0142", priceRange: "$150" });
    expect(ld.address).toMatchObject({ "@type": "PostalAddress", addressLocality: "Chicago", addressRegion: "IL", postalCode: "60614" });
    expect(ld).not.toHaveProperty("review");
    expect(ld).not.toHaveProperty("aggregateRating");
  });

  it("has every section, meta tags, the booking button and the demo license line", () => {
    for (const t of ["Who I help", "How it works", "Fees and insurance", "Location", "About Dana Reyes", "Questions", "Book a consult"]) expect(html).toContain(t);
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<link rel="canonical" href="https://www.example.com">');
    expect(html).toContain('href="https://cal.example.com/dana/consult"');
    expect(html).toContain("Book a free 15-minute consult");
    expect(html).toContain(DEMO_LICENSE_LINE);
    expect(d.licenseLine).toBe("Dana Reyes, LCPC (fictional demo practice)");
    expect(html).toContain("call or text 988");
    expect(html).toContain("[Sample] Fictional demo practice");
    expect(html).not.toMatch(/testimonial|review|guarantee|cure|best therapist/i);
    expect(html).not.toMatch(/\b\d{3}[.-]\d{6}\b/); // never a license number
  });

  it("writes llms.txt, robots.txt (noindex for the demo) and a sitemap", () => {
    expect(renderLlmsTxt(d)).toMatch(/^# Reyes Counseling PLLC\n\n> /);
    expect(renderRobotsTxt(d)).toBe("User-agent: *\nDisallow: /\n");
    expect(renderRobotsTxt({ ...d, isSample: false })).toContain("Sitemap: https://www.example.com/sitemap.xml");
    expect(renderSitemap(d, "2026-11-02")).toContain("<loc>https://www.example.com/</loc><lastmod>2026-11-02</lastmod>");
    expect(renderSquarespaceText(d)).toContain("=== Fees and insurance ===");
  });

  it("zips the four files into a valid stored zip", () => {
    const files = siteFiles(d, "2026-11-02");
    const zip = makeZip(files);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(zip.readUInt32LE(end)).toBe(0x06054b50);
    expect(zip.readUInt16LE(end + 10)).toBe(4);
    // first entry: name and data come back intact with a matching CRC
    const nameLen = zip.readUInt16LE(26);
    const size = zip.readUInt32LE(18);
    expect(zip.subarray(30, 30 + nameLen).toString()).toBe("index.html");
    const data = zip.subarray(30 + nameLen, 30 + nameLen + size);
    expect(data.toString()).toBe(files[0].data);
    expect(zip.readUInt32LE(14)).toBe(crc32(data));
    expect(crc32(Buffer.from("123456789"))).toBe(0xcbf43926);
  });

  it("says who she helps in service words, never 'you' plus a condition", () => {
    const who = d.sections.find((s) => s.id === "who")!;
    expect(who.paragraphs).toEqual(["I work with adults and couples on anxiety and life transitions."]);
    expect(html).not.toMatch(/feel stuck/);
  });

  it("runs the personal-attribute rule on the landing copy, and the license-number rule on page-wide text", () => {
    const bad = { ...d, sections: d.sections.map((s) => (s.id === "who" ? { ...s, paragraphs: ["Struggling with anxiety? I can help."] } : s)) };
    expect(checkSite(bad, DANA).findings.some((f) => f.rule === "personal_attribute")).toBe(true);
    // the same words lower on the page (her own description of how she works) aren't held to the ad rule
    const lower = { ...d, sections: d.sections.map((s) => (s.id === "how" ? { ...s, paragraphs: [...s.paragraphs, "People who feel stuck often start here."] } : s)) };
    expect(checkSite(lower, DANA).ok).toBe(true);
    expect(checkSite({ ...d, licenseLine: "Dana Reyes, LCPC, license 180.012345" }, DANA).ok).toBe(false);
    expect(checkSite({ ...d, title: "Reyes Counseling | license no. 180012345" }, DANA).ok).toBe(false);
    expect(checkSite({ ...d, bookingLabel: "Book with the best therapist in Chicago" }, DANA).ok).toBe(false);
    expect(checkSite({ ...d, description: "Guaranteed results" }, DANA).ok).toBe(false);
  });

  it("escapes < in the Squarespace details block", () => {
    const evil = { ...d, jsonLd: { ...d.jsonLd, name: "</script><script>alert(1)</script>" } };
    const text = renderSquarespaceText(evil);
    expect(text).not.toContain("</script><script>");
    expect(text).toContain("\\u003c/script>");
  });

  it("uses her phone when there is no booking link", () => {
    const p = draftSite(DANA, { ...S, bookingUrl: null });
    expect(p.bookingHref).toBe("tel:3125550142");
  });
});
