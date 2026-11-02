// Ad drafts and the plain-code policy check: character limits, banned claims, no
// condition targeting, no audiences, a hard cap, and a Google Ads Editor CSV.
import { describe, expect, it } from "vitest";
import { checkGoogleDraft, checkMetaDraft, draftGoogleAds, draftMetaAds, googleAdsEditorCsv, metaAdsSpec, type GrowthSettings } from "../lib/growth/ads";
import { checkKeyword, checkTargeting, checkText, LIMITS } from "../lib/growth/policy";
import { DANA } from "./media-fixtures";

const S: GrowthSettings = { siteUrl: "https://www.example.com", bookingUrl: null, monthlyCapCents: 30000, radiusMiles: 5 };
const blocked = (fs: { severity: string }[]) => fs.some((f) => f.severity === "block");

describe("ad policy check", () => {
  it("blocks banned claims", () => {
    for (const t of ["Cure your worries", "Guaranteed results", "Best therapist in Chicago", "#1 counselor", "Read our 5 star reviews", "HIPAA-compliant telehealth", "HIPAA compliant", "Testimonials from clients"]) {
      expect(blocked(checkText(t, "x", null, DANA)), t).toBe(true);
    }
  });

  it("blocks wording that implies the reader's condition (Google and Meta personal attributes)", () => {
    for (const t of ["Is your anxiety getting worse?", "Do you have depression?", "Struggling with stress?", "Feeling overwhelmed lately", "You're anxious and alone"]) {
      expect(checkText(t, "x", null, null).some((f) => f.rule === "personal_attribute"), t).toBe(true);
    }
    expect(blocked(checkText("Therapy in Lincoln Park", "x", null, DANA))).toBe(false);
  });

  it("enforces character limits", () => {
    expect(checkText("x".repeat(31), "headline", LIMITS.googleHeadline, null)[0]).toMatchObject({ rule: "too_long", severity: "block" });
    expect(checkText("x".repeat(30), "headline", LIMITS.googleHeadline, null)).toEqual([]);
  });

  it("blocks keywords that target a condition or trigger certification", () => {
    expect(blocked(checkKeyword("addiction rehab chicago"))).toBe(true);
    expect(blocked(checkKeyword("adhd medication doctor"))).toBe(true);
    expect(blocked(checkKeyword("struggling with anxiety"))).toBe(true);
    expect(blocked(checkKeyword("anxiety therapist chicago"))).toBe(false);
  });

  it("blocks audiences, interests and a missing cap", () => {
    expect(checkTargeting({ audiences: ["remarketing"], monthlyCapCents: 100 }).map((f) => f.rule)).toEqual(["audience_targeting"]);
    expect(checkTargeting({ audiences: ["customer_match"], monthlyCapCents: 100 })[0].severity).toBe("block");
    expect(checkTargeting({ interests: ["mental health"], monthlyCapCents: 100 })[0].rule).toBe("audience_targeting");
    expect(checkTargeting({ monthlyCapCents: null })[0].rule).toBe("no_budget_cap");
  });
});

describe("Google Search draft", () => {
  const d = draftGoogleAds(DANA, S);

  it("passes the policy check with RSA limits", () => {
    expect(d.check.ok).toBe(true);
    expect(d.ad.headlines.length).toBeGreaterThanOrEqual(3);
    expect(d.ad.headlines.length).toBeLessThanOrEqual(15);
    for (const h of d.ad.headlines) expect([...h].length).toBeLessThanOrEqual(30);
    expect(d.ad.descriptions.length).toBeGreaterThanOrEqual(2);
    for (const x of d.ad.descriptions) expect([...x].length).toBeLessThanOrEqual(90);
    expect(d.ad.headlines).toContain("Free 15-Minute Consult");
    expect(d.ad.headlines).toContain("Private Pay $150 a Session");
  });

  it("targets keywords and a radius only, with a hard cap and paused status", () => {
    expect(d.adGroup.keywords.map((k) => k.text)).toEqual(expect.arrayContaining(["therapist lincoln park", "anxiety therapist chicago", "online therapy illinois"]));
    expect(d.targeting).toEqual({ audiences: [], interests: [] });
    expect(d.campaign).toMatchObject({ status: "Paused", monthlyCapCents: 30000, dailyBudgetCents: 986, location: { label: "Lincoln Park, Chicago, IL", radiusMiles: 5 } });
    expect(d.negatives).toEqual(expect.arrayContaining(["jobs", "rehab", "medication"]));
    expect(d.ad.finalUrl).toBe("https://www.example.com");
    expect(d.campaign.name.startsWith("[Sample] ")).toBe(true);
  });

  it("fails the check when a bad headline, an audience or no cap is added", () => {
    const { check: _c, ...body } = d;
    void _c;
    expect(checkGoogleDraft({ ...body, ad: { ...body.ad, headlines: [...body.ad.headlines.slice(0, 3), "Guaranteed Anxiety Cure"] } }, DANA).ok).toBe(false);
    expect(checkGoogleDraft({ ...body, targeting: { audiences: ["remarketing"], interests: [] } }, DANA).ok).toBe(false);
    expect(checkGoogleDraft({ ...body, campaign: { ...body.campaign, monthlyCapCents: null } }, DANA).ok).toBe(false);
    expect(checkGoogleDraft({ ...body, ad: { ...body.ad, headlines: ["This headline is far longer than thirty", ...body.ad.headlines.slice(1)] } }, DANA).ok).toBe(false);
  });

  it("exports a Google Ads Editor CSV: paused, daily budget, keywords, negatives and the ad", () => {
    const csv = googleAdsEditorCsv(d);
    const lines = csv.trim().split("\r\n");
    expect(lines[0].split(",").slice(0, 3)).toEqual(["Campaign", "Campaign Type", "Campaign Status"]);
    expect(csv).toContain("Paused");
    expect(csv).toContain("9.86");
    expect(csv).toContain("Campaign Negative Phrase");
    expect(csv).toContain("Responsive search ad");
    expect(csv).toContain('"Lincoln Park, Chicago, IL"');
    expect(lines[0]).toContain("Headline 15,Description 1");
    // one row each for campaign, location and ad group, then keywords, negatives and the ad
    expect(lines).toHaveLength(1 + 3 + d.adGroup.keywords.length + d.negatives.length + 1);
  });
});

describe("Meta draft", () => {
  const d = draftMetaAds(DANA, S, "plain");

  it("passes the policy check with broad targeting only", () => {
    expect(d.check.ok).toBe(true);
    expect(d.ads).toHaveLength(2);
    expect(d.adSet).toMatchObject({ ageMin: 18, audiences: [], interests: [], optimization: "LINK_CLICKS" });
    expect(d.campaign.status).toBe("PAUSED");
    for (const a of d.ads) expect([...a.headline].length).toBeLessThanOrEqual(40);
  });

  it("fails on interest targeting or condition wording", () => {
    const { check: _c, ...body } = d;
    void _c;
    expect(checkMetaDraft({ ...body, adSet: { ...body.adSet, interests: ["anxiety"] } }, DANA).ok).toBe(false);
    expect(checkMetaDraft({ ...body, ads: [{ ...body.ads[0], primaryText: "Is your anxiety keeping you up? Book now." }] }, DANA).ok).toBe(false);
  });

  it("spec says no pixel, no audiences, paused", () => {
    const spec = metaAdsSpec(d);
    expect(spec.ad_set).toMatchObject({ detailed_targeting: "none", custom_audiences: "none", lookalike_audiences: "none" });
    expect(spec.campaign.status).toBe("PAUSED");
    expect(spec.how_to_use.join(" ")).toMatch(/Don't install the Meta Pixel/);
    expect(spec.note).toMatch(/\[Sample\]/);
  });
});
