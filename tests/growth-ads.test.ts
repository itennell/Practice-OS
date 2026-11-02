// Ad drafts and the plain-code policy check: character limits, banned claims, no
// condition targeting, no audiences, a hard cap, and a Google Ads Editor CSV.
import { describe, expect, it } from "vitest";
import { checkGoogleDraft, checkMetaDraft, draftGoogleAds, draftMetaAds, googleAdsEditorCsv, metaAdsSpec, type GrowthSettings } from "../lib/growth/ads";
import { checkKeyword, checkTargeting, checkText, LIMITS, MIN_CAP_CENTS, MIN_CAP_MESSAGE } from "../lib/growth/policy";
import { article, csvField, feeLine, GOOGLE_BUDGET_NOTE, priceRange, sessionLength } from "../lib/growth/ads";
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
    expect(checkTargeting({ audiences: ["remarketing"], monthlyCapCents: 30000 }).map((f) => f.rule)).toEqual(["audience_targeting"]);
    expect(checkTargeting({ audiences: ["customer_match"], monthlyCapCents: 30000 })[0].severity).toBe("block");
    expect(checkTargeting({ interests: ["mental health"], monthlyCapCents: 30000 })[0].rule).toBe("audience_targeting");
    expect(checkTargeting({ monthlyCapCents: null })[0].rule).toBe("no_budget_cap");
  });

  it("needs a cap of at least $150 a month, with a plain message", () => {
    expect(checkTargeting({ monthlyCapCents: 14999 })[0]).toMatchObject({ rule: "no_budget_cap", message: MIN_CAP_MESSAGE });
    expect(checkTargeting({ monthlyCapCents: MIN_CAP_CENTS })).toEqual([]);
    expect(MIN_CAP_CENTS).toBe(15000);
  });

  it("blocks condition openers in questions and verbs, but allows plain service nouns", () => {
    for (const t of ["Struggle with anxiety?", "Anxiety? We can help", "Tired of feeling stuck", "Do you feel alone?", "Free yourself from worry", "Overcome stress", "Relief from panic", "Is worry keeping you up?", "Get over a breakup", "Heal from trauma"]) {
      expect(checkText(t, "x", LIMITS.googleHeadline, null).some((f) => f.rule === "personal_attribute"), t).toBe(true);
    }
    for (const t of ["Anxiety Therapy in Chicago", "Couples Counseling Chicago", "Help With Life Changes", "Therapy in Lincoln Park"]) {
      expect(blocked(checkText(t, "x", LIMITS.googleHeadline, DANA)), t).toBe(false);
    }
  });

  it("runs the certification words on ad text too", () => {
    expect(checkText("Addiction counseling in Chicago", "x", null, null).some((f) => f.rule === "certification_keyword")).toBe(true);
    expect(checkText("Suboxone and rehab help", "x", null, null).some((f) => f.rule === "certification_keyword")).toBe(true);
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
    expect(d.ad.headlines).toContain("[Sample] Sessions $150");
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

  it("never puts her free-text focus answer in an ad, only service words", () => {
    const loud = { ...DANA, answers: { ...DANA.answers, focus: "Anxiety, and people who feel stuck and lonely" } };
    const g = draftGoogleAds(loud, S);
    expect(g.ad.descriptions.join(" ")).not.toMatch(/stuck|lonely|reach out/i);
    expect(g.adGroup.keywords.map((k) => k.text)).toContain("anxiety therapist chicago");
  });

  it("says how Google's daily budget relates to the cap", () => {
    expect(GOOGLE_BUDGET_NOTE).toMatch(/twice the daily budget/);
    expect(GOOGLE_BUDGET_NOTE).toMatch(/30\.4/);
  });

  it("neutralises spreadsheet formulas in CSV cells", () => {
    for (const bad of ["=HYPERLINK(1)", "+1", "-2", "@SUM(A1)"]) expect(csvField(bad).replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    expect(csvField("Therapy in Lincoln Park")).toBe("Therapy in Lincoln Park");
    expect(csvField("a, b")).toBe('"a, b"');
    expect(csvField(9.86)).toBe("9.86");
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

  it("uses a lifetime budget equal to her monthly cap, over a 30-day run", () => {
    const m = draftMetaAds(DANA, S, "plain", new Date("2026-11-02T12:00:00Z"));
    expect(m.campaign).toMatchObject({ budgetType: "LIFETIME", lifetimeBudgetCents: 30000, monthlyCapCents: 30000, startDate: "2026-11-02", endDate: "2026-12-02" });
    const spec = metaAdsSpec(m);
    expect(spec.campaign).toMatchObject({ budget_type: "lifetime", lifetime_budget: "$300", end_date: "2026-12-02" });
    expect(spec.campaign).not.toHaveProperty("daily_budget");
    const { check: _c, ...body } = m;
    void _c;
    expect(checkMetaDraft({ ...body, campaign: { ...body.campaign, lifetimeBudgetCents: 90000 } }, DANA).ok).toBe(false);
  });

  it("cuts the description by characters, not UTF-16 units", () => {
    const m = draftMetaAds({ ...DANA, practiceName: "🌿".repeat(40) }, S);
    expect(Array.from(m.ads[0].description)).toHaveLength(30);
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

describe("fee wording in ads (her real session fees, sample-labelled)", () => {
  const FEES = [
    { label: "First session (intake)", cents: 20000 },
    { label: "Therapy, 38-52 minutes", cents: 15000 },
    { label: "Therapy, 53 minutes or longer", cents: 17500 },
  ];
  const real = { ...DANA, isSample: false, fees: FEES };

  it("lists every session fee with its length, never one ambiguous price", () => {
    expect(feeLine(real)).toBe("$150 (45 min) / $175 (53+ min)");
    expect(feeLine({ ...real, isSample: true })).toBe("[Sample] $150 (45 min) / $175 (53+ min)");
    expect(priceRange(real)).toBe("$150–$200");
    expect(sessionLength("90834 Psychotherapy, 45 min")).toBe("45 min");
    expect(["LCPC", "LCSW", "LMFT", "PhD", "PsyD", "counselor"].map(article)).toEqual(["an", "an", "an", "a", "a", "a"]);
  });

  it("puts both prices in a Google headline and the Meta fee ad", () => {
    const g = draftGoogleAds(real, S);
    expect(g.check.ok).toBe(true);
    // Dana is in network with BCBSIL, so "Private Pay $150 / $175" (private pay only) is never offered.
    expect(g.ad.headlines).toContain("Sessions $150 / $175");
    expect(g.ad.headlines.some((h) => /^Private Pay \$/.test(h))).toBe(false);
    expect(g.ad.descriptions.join(" ")).toContain("$150 (45 min) / $175 (53+ min)");
    const m = draftMetaAds(real, S);
    expect(m.check.ok).toBe(true);
    expect(m.ads.map((a) => a.primaryText).join(" ")).toContain("Private pay or Blue Cross Blue Shield of Illinois. Sessions are $150 (45 min) / $175 (53+ min).");
    // Out of network everywhere, "Private Pay $150 / $175" is true and kept.
    const out = { ...real, inNetwork: [], insurers: [] };
    expect(draftGoogleAds(out, S).ad.headlines).toContain("Private Pay $150 / $175");
    expect(draftMetaAds(out, S).ads.map((a) => a.primaryText).join(" ")).toContain("Private-pay sessions are $150 (45 min) / $175 (53+ min).");
  });

  it("the ad check runs the shared fact check: 'Private pay only' while in network is blocked", () => {
    const blocked = (t: string) => checkText(t, "headline", null, real).some((x) => x.rule === "wrong_fact" && x.severity === "block");
    expect(blocked("Private pay only")).toBe(true);
    expect(blocked("Private pay only, Aetna included.")).toBe(true);
    expect(blocked("Private pay or Blue Cross Blue Shield of Illinois.")).toBe(false);
    expect(blocked("Book a free discovery call.")).toBe(false); // Dana offers a free 15-minute consult
    expect(blocked("Superbills every session.")).toBe(true);
  });

  it("never exports a [Sample] fee without the label", () => {
    const g = draftGoogleAds({ ...DANA, fees: FEES }, S);
    const m = draftMetaAds({ ...DANA, fees: FEES }, S);
    for (const t of [...g.ad.headlines, ...g.ad.descriptions, ...m.ads.map((a) => a.primaryText)]) if (/\$\d/.test(t)) expect(t).toMatch(/\[Sample\][^$]*\$\d/);
  });
});
