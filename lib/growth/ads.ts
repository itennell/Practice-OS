// Ad drafts for Google Search and for Facebook/Instagram, written in plain code from
// her saved facts (lib/media/facts.ts). Drafts only: nothing here calls an ad
// platform, and every draft is exported PAUSED for her to import and start herself.
// The policy check (./policy.ts) must pass before a draft can be queued.
//
// Targeting (docs/research.md > Growth agent, section 1): keywords plus her city
// radius only. Keywords may name a service ("anxiety therapist Chicago"); the ad copy
// never says or implies the reader has a condition, and there is no remarketing,
// Customer Match, lookalike or health-interest audience on either platform.
import { STATES } from "../compliance/states";
import type { MediaFacts } from "../media/facts";
import { checkKeyword, checkTargeting, checkText, LIMITS, result, type PolicyCheck, type PolicyFinding } from "./policy";
import { usd } from "./plan";

export type GrowthSettings = {
  /** Her website address, where every ad sends people. */
  siteUrl: string | null;
  /** Her online booking link (Cal.com or another tool); missing = her phone. */
  bookingUrl: string | null;
  /** The hard monthly cap she chose, in cents. null = not set yet. */
  monthlyCapCents: number | null;
  radiusMiles: number;
  /** The cap is the demo practice's [Sample] one, not hers. */
  capIsSample?: boolean;
};

export { MIN_CAP_CENTS, MIN_CAP_MESSAGE } from "./policy";
/** A Meta campaign runs for this many days on a lifetime budget equal to her monthly cap. */
export const META_RUN_DAYS = 30;

export const SAMPLE_SITE_URL = "https://www.example.com";
export const DEFAULT_RADIUS_MILES = 5;
/**
 * Google may spend up to twice the average daily budget on a given day, but over a month
 * no more than 30.4 times it ("About overdelivery and your average daily budget",
 * https://support.google.com/google-ads/answer/2375423; docs/research.md > Growth agent, section 10).
 */
export const DAYS_PER_MONTH = 30.4;
export const GOOGLE_BUDGET_NOTE =
  "Google may spend up to twice the daily budget on a busy day, but over a month it charges no more than the daily budget times 30.4, which stays under your cap.";

export type Keyword = { text: string; match: "Phrase" | "Exact" };
export type GoogleAdsDraft = {
  platform: "google";
  campaign: {
    name: string;
    type: "Search";
    status: "Paused";
    monthlyCapCents: number | null;
    dailyBudgetCents: number | null;
    networks: "Google Search";
    languages: string[];
    location: { label: string; radiusMiles: number };
    bidStrategy: "Maximize clicks";
  };
  adGroup: { name: string; keywords: Keyword[] };
  negatives: string[];
  ad: { headlines: string[]; descriptions: string[]; path1: string; path2: string; finalUrl: string };
  targeting: { audiences: string[]; interests: string[] };
  check: PolicyCheck;
  isSample: boolean;
};

export type MetaAd = { name: string; primaryText: string; headline: string; description: string; cta: "BOOK_NOW" | "LEARN_MORE"; ctaLabel: string; url: string };
export type MetaAdsDraft = {
  platform: "meta";
  /** A lifetime budget equal to her monthly cap, over a fixed 30-day run: Meta stops spending at the cap. */
  campaign: { name: string; objective: "OUTCOME_TRAFFIC"; status: "PAUSED"; budgetType: "LIFETIME"; monthlyCapCents: number | null; lifetimeBudgetCents: number | null; startDate: string; endDate: string };
  adSet: {
    location: { label: string; radiusMiles: number };
    ageMin: 18;
    ageMax: 65;
    genders: "all";
    placements: "Advantage+ placements";
    optimization: "LINK_CLICKS";
    audiences: string[];
    interests: string[];
  };
  ads: MetaAd[];
  image: { alt: string; source: "muse" | "plain" | null; /** Why the plain picture stands in, when Muse was tried. */ fallback?: string };
  check: PolicyCheck;
  isSample: boolean;
};

export type AdsDraft = GoogleAdsDraft | MetaAdsDraft;

const stateName = (f: MediaFacts) => STATES[f.state] ?? f.state;
const fits = (max: number) => (s: string) => [...s].length <= max;
const uniq = <T>(xs: T[]) => [...new Set(xs)];
const lower = (s: string) => s.toLowerCase();
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Issue words from her own focus answer that are safe as search keywords (services, not people). */
const ISSUES: { re: RegExp; word: string }[] = [
  { re: /\banxi/i, word: "anxiety" },
  { re: /\bdepress/i, word: "depression" },
  { re: /\bcouples?\b|\bmarriage\b/i, word: "couples" },
  { re: /\blife (changes?|transitions?)\b/i, word: "life transitions" },
  { re: /\bgrief\b/i, word: "grief" },
  { re: /\bstress\b/i, word: "stress" },
  { re: /\brelationship/i, word: "relationship" },
  { re: /\bfamil/i, word: "family" },
];

export function focusIssues(f: MediaFacts): string[] {
  const words = `${f.answers.focus} ${f.whoIHelp}`;
  return ISSUES.filter((i) => i.re.test(words)).map((i) => i.word);
}

export function locationLabel(f: MediaFacts): string {
  return [f.neighborhood, f.city, f.state].filter(Boolean).join(", ");
}

export function dailyBudgetCents(monthlyCapCents: number | null): number | null {
  return monthlyCapCents ? Math.floor(monthlyCapCents / DAYS_PER_MONTH) : null;
}

/** Where the ad sends people: her site (the sample site for the demo practice). */
export function finalUrl(f: MediaFacts, s: GrowthSettings): string {
  return s.siteUrl ?? f.website ?? SAMPLE_SITE_URL;
}

const sample = (f: MediaFacts, name: string) => (f.isSample ? `[Sample] ${name}` : name);

// ---- Google Search ------------------------------------------------------------

export function googleKeywords(f: MediaFacts): Keyword[] {
  const city = lower(f.city);
  const hood = f.neighborhood ? lower(f.neighborhood) : null;
  const base = [
    hood && `therapist ${hood}`,
    hood && `counseling ${hood}`,
    hood && `therapy ${hood}`,
    `therapist ${city}`,
    `counselor ${city}`,
    `private pay therapist ${city}`,
    f.telehealth && `online therapy ${lower(stateName(f))}`,
    f.telehealth && `telehealth therapist ${lower(stateName(f))}`,
    ...focusIssues(f).map((w) => `${w} ${w === "couples" || w === "family" ? "counseling" : "therapist"} ${city}`),
  ].filter((k): k is string => Boolean(k));
  return uniq(base)
    .filter((k) => !checkKeyword(k).some((x) => x.severity === "block"))
    .map((text, i) => ({ text, match: i < 3 ? "Exact" : "Phrase" }));
}

export const NEGATIVE_KEYWORDS = [
  "free", "jobs", "job", "salary", "hiring", "career", "school", "degree", "course", "training", "license exam",
  "ceu", "internship", "how to become", "psychiatrist", "medication", "rehab", "detox", "hotline", "crisis line", "reddit",
];

export function googleHeadlines(f: MediaFacts): string[] {
  const fee = mainPrivateFee(f);
  const c = f.answers.freeConsultMinutes;
  const issues = focusIssues(f);
  const all = [
    f.practiceName,
    f.neighborhood ? `Therapy in ${f.neighborhood}` : `Therapy in ${f.city}`,
    `${f.name}, ${f.credential}`,
    c ? `Free ${c}-Minute Consult` : null,
    f.telehealth ? `Online Therapy in ${stateName(f)}` : null,
    fee ? `Private Pay ${fee} a Session` : null,
    "Superbills for Insurance",
    "Book a Consult Online",
    `Counseling in ${f.city}`,
    issues.includes("couples") ? `Couples Counseling ${f.city}` : null,
    issues.includes("anxiety") ? `Anxiety Therapy in ${f.city}` : null,
    issues.includes("life transitions") ? "Help With Life Changes" : null,
    f.inNetwork[0] ? `In Network: ${f.inNetwork[0]}` : null,
  ].filter((h): h is string => Boolean(h));
  return uniq(all).filter(fits(LIMITS.googleHeadline)).filter((h) => !checkText(h, "headline", LIMITS.googleHeadline, f).some((x) => x.severity === "block")).slice(0, LIMITS.googleHeadlinesMax);
}

export function googleDescriptions(f: MediaFacts): string[] {
  const fee = mainPrivateFee(f);
  const c = f.answers.freeConsultMinutes;
  const where = f.neighborhood ?? f.city;
  const candidates = [
    `Talk with ${f.name}, ${f.credential}, in ${where}${f.telehealth ? " or by video" : ""}.${c ? ` Book a free ${c}-minute consult.` : " Book a consult online."}`,
    `Talk with ${f.name}, ${f.credential}, in ${where}.${c ? ` Free ${c}-minute consult.` : ""}`,
    fee ? `Private-pay sessions are ${fee}. Superbills for out-of-network insurance claims.` : null,
    fee ? `Sessions are ${fee}. Ask for a superbill to send to your insurance.` : null,
    f.telehealth ? `In person in ${where} and by video anywhere in ${stateName(f)}. Book online.` : `In person in ${where}. Book a consult online.`,
    f.inNetwork.length ? `In network with ${f.inNetwork.join(" and ")}. Private pay welcome.` : null,
  ].filter((d): d is string => Boolean(d));
  return uniq(candidates).filter((d) => !checkText(d, "description", LIMITS.googleDescription, f).some((x) => x.severity === "block")).slice(0, LIMITS.googleDescriptionsMax);
}

export function mainPrivateFee(f: MediaFacts): string | null {
  const fee = f.fees.find((x) => /\b90834\b/.test(x.label)) ?? f.fees.find((x) => !/\b(intake|first session|initial|evaluation|assessment)\b/i.test(x.label)) ?? f.fees[0];
  return fee ? usd(fee.cents) : null;
}

export function checkGoogleDraft(d: Omit<GoogleAdsDraft, "check">, f: MediaFacts | null): PolicyCheck {
  const out: PolicyFinding[] = [];
  const { headlines, descriptions } = d.ad;
  if (headlines.length < LIMITS.googleHeadlinesMin) out.push({ rule: "too_few", severity: "block", where: "headlines", message: `A responsive search ad needs at least ${LIMITS.googleHeadlinesMin} headlines.` });
  if (headlines.length > LIMITS.googleHeadlinesMax) out.push({ rule: "too_long", severity: "block", where: "headlines", message: `At most ${LIMITS.googleHeadlinesMax} headlines.` });
  if (descriptions.length < LIMITS.googleDescriptionsMin) out.push({ rule: "too_few", severity: "block", where: "descriptions", message: `A responsive search ad needs at least ${LIMITS.googleDescriptionsMin} descriptions.` });
  if (descriptions.length > LIMITS.googleDescriptionsMax) out.push({ rule: "too_long", severity: "block", where: "descriptions", message: `At most ${LIMITS.googleDescriptionsMax} descriptions.` });
  headlines.forEach((h, i) => out.push(...checkText(h, `headline ${i + 1}`, LIMITS.googleHeadline, f)));
  descriptions.forEach((x, i) => out.push(...checkText(x, `description ${i + 1}`, LIMITS.googleDescription, f)));
  for (const [i, p] of [d.ad.path1, d.ad.path2].entries()) if ([...p].length > LIMITS.googlePath) out.push({ rule: "too_long", severity: "block", where: `path ${i + 1}`, message: `Display paths take ${LIMITS.googlePath} characters.` });
  for (const k of d.adGroup.keywords) out.push(...checkKeyword(k.text));
  if (!/^https:\/\//.test(d.ad.finalUrl)) out.push({ rule: "lint", severity: "block", where: "final URL", message: "The ad must send people to her own site over https." });
  out.push(...checkTargeting({ ...d.targeting, monthlyCapCents: d.campaign.monthlyCapCents }));
  return result(out);
}

export function draftGoogleAds(f: MediaFacts, s: GrowthSettings): GoogleAdsDraft {
  const languages = ["English", ...(/spanish/i.test(f.answers.languages) ? ["Spanish"] : [])];
  const body: Omit<GoogleAdsDraft, "check"> = {
    platform: "google",
    campaign: {
      name: sample(f, `${f.practiceName} - Search - ${f.neighborhood ?? f.city}`),
      type: "Search",
      status: "Paused",
      monthlyCapCents: s.monthlyCapCents,
      dailyBudgetCents: dailyBudgetCents(s.monthlyCapCents),
      networks: "Google Search",
      languages,
      location: { label: locationLabel(f), radiusMiles: s.radiusMiles },
      bidStrategy: "Maximize clicks",
    },
    adGroup: { name: "Therapy near her office", keywords: googleKeywords(f) },
    negatives: NEGATIVE_KEYWORDS,
    ad: {
      headlines: googleHeadlines(f),
      descriptions: googleDescriptions(f),
      path1: "therapy",
      path2: slug(f.neighborhood ?? f.city).slice(0, LIMITS.googlePath),
      finalUrl: finalUrl(f, s),
    },
    targeting: { audiences: [], interests: [] },
    isSample: f.isSample,
  };
  return { ...body, check: checkGoogleDraft(body, f) };
}

/** RFC 4180 field: quoted when it holds a comma, quote or line break. */
export function csvField(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? "" : String(v);
  // A cell starting with = + - @ (or a tab/return) runs as a formula in a spreadsheet: make it plain text.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The campaign as a Google Ads Editor import (Account > Import > From file). The
 * campaign is Paused: nothing runs or spends until she reviews it in Google Ads and
 * turns it on herself.
 */
export function googleAdsEditorCsv(d: GoogleAdsDraft): string {
  const H = Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`);
  const D = Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`);
  const cols = ["Campaign", "Campaign Type", "Campaign Status", "Budget", "Budget type", "Bid Strategy Type", "Networks", "Languages", "Location", "Radius", "Unit", "Ad Group", "Ad Group Status", "Keyword", "Criterion Type", "Ad type", ...H, ...D, "Path 1", "Path 2", "Final URL", "Status"];
  const rows: Record<string, string | number | null>[] = [];
  const c = d.campaign;
  const budget = c.dailyBudgetCents === null ? null : (c.dailyBudgetCents / 100).toFixed(2);
  rows.push({ Campaign: c.name, "Campaign Type": "Search", "Campaign Status": "Paused", Budget: budget, "Budget type": "Daily", "Bid Strategy Type": c.bidStrategy, Networks: "Google search", Languages: c.languages.map((l) => (l === "Spanish" ? "es" : "en")).join(";") });
  rows.push({ Campaign: c.name, Location: c.location.label, Radius: c.location.radiusMiles, Unit: "mi" });
  rows.push({ Campaign: c.name, "Ad Group": d.adGroup.name, "Ad Group Status": "Enabled" });
  for (const k of d.adGroup.keywords) rows.push({ Campaign: c.name, "Ad Group": d.adGroup.name, Keyword: k.text, "Criterion Type": k.match, Status: "Enabled" });
  for (const n of d.negatives) rows.push({ Campaign: c.name, Keyword: n, "Criterion Type": "Campaign Negative Phrase" });
  const ad: Record<string, string> = { Campaign: c.name, "Ad Group": d.adGroup.name, "Ad type": "Responsive search ad", "Path 1": d.ad.path1, "Path 2": d.ad.path2, "Final URL": d.ad.finalUrl, Status: "Enabled" };
  d.ad.headlines.forEach((h, i) => (ad[H[i]] = h));
  d.ad.descriptions.forEach((x, i) => (ad[D[i]] = x));
  rows.push(ad);
  return [cols.join(","), ...rows.map((r) => cols.map((k) => csvField(r[k])).join(","))].join("\r\n") + "\r\n";
}

// ---- Facebook and Instagram ------------------------------------------------------

export function metaAds(f: MediaFacts, s: GrowthSettings): MetaAd[] {
  const c = f.answers.freeConsultMinutes;
  const fee = mainPrivateFee(f);
  const where = f.neighborhood ?? f.city;
  const url = finalUrl(f, s);
  const first: MetaAd = {
    name: "Consult",
    primaryText: `Therapy with ${f.name}, ${f.credential}, in ${where}${f.telehealth ? ` and by video across ${stateName(f)}` : ""}.${c ? ` Book a free ${c}-minute consult to see if it's a fit.` : " Book a consult online."}`,
    headline: c ? `Free ${c}-minute consult` : `Therapy in ${where}`,
    description: Array.from(f.practiceName).slice(0, LIMITS.metaDescription).join(""),
    cta: "BOOK_NOW",
    ctaLabel: "Book now",
    url,
  };
  const second: MetaAd | null = fee
    ? {
        name: "Fees",
        primaryText: `Private-pay sessions are ${fee}. ${f.name}, ${f.credential}, gives superbills you can send to your insurance for out-of-network claims.`,
        headline: `Therapy in ${where}`,
        description: "Fees and how to book",
        cta: "LEARN_MORE",
        ctaLabel: "Learn more",
        url,
      }
    : null;
  return [first, ...(second ? [second] : [])];
}

export function checkMetaDraft(d: Omit<MetaAdsDraft, "check">, f: MediaFacts | null): PolicyCheck {
  const out: PolicyFinding[] = [];
  d.ads.forEach((a, i) => {
    const n = `ad ${i + 1}`;
    out.push(...checkText(a.primaryText, `${n} text`, null, f), ...checkText(a.headline, `${n} headline`, null, f), ...checkText(a.description, `${n} description`, null, f));
    if ([...a.primaryText].length > LIMITS.metaPrimary) out.push({ rule: "too_long", severity: "warn", where: `${n} text`, message: `Meta shows about ${LIMITS.metaPrimary} characters before "See more".` });
    if ([...a.headline].length > LIMITS.metaHeadline) out.push({ rule: "too_long", severity: "block", where: `${n} headline`, message: `Keep headlines under ${LIMITS.metaHeadline} characters.` });
    if (!/^https:\/\//.test(a.url)) out.push({ rule: "lint", severity: "block", where: `${n} link`, message: "The ad must send people to her own site over https." });
  });
  if (d.adSet.ageMin !== 18) out.push({ rule: "audience_targeting", severity: "block", where: "targeting", message: "Adults 18 and up only." });
  out.push(...checkTargeting({ audiences: d.adSet.audiences, interests: d.adSet.interests, monthlyCapCents: d.campaign.monthlyCapCents }));
  // The cap is a real stop only as a lifetime budget of exactly the cap, with an end date.
  if (d.campaign.budgetType !== "LIFETIME" || d.campaign.lifetimeBudgetCents !== d.campaign.monthlyCapCents || !d.campaign.endDate)
    out.push({ rule: "no_budget_cap", severity: "block", where: "budget", message: "Meta needs a lifetime budget equal to your monthly cap, with an end date." });
  return result(out);
}

export const META_IMAGE_ALT = "A calm, sunlit counseling office with two armchairs and a plant. No people.";

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function draftMetaAds(f: MediaFacts, s: GrowthSettings, image: MetaAdsDraft["image"]["source"] = null, today: Date = new Date()): MetaAdsDraft {
  const end = new Date(today.getTime() + META_RUN_DAYS * 86_400_000);
  const body: Omit<MetaAdsDraft, "check"> = {
    platform: "meta",
    campaign: {
      name: sample(f, `${f.practiceName} - Traffic - ${f.neighborhood ?? f.city}`),
      objective: "OUTCOME_TRAFFIC",
      status: "PAUSED",
      budgetType: "LIFETIME",
      monthlyCapCents: s.monthlyCapCents,
      lifetimeBudgetCents: s.monthlyCapCents,
      startDate: isoDay(today),
      endDate: isoDay(end),
    },
    adSet: { location: { label: locationLabel(f), radiusMiles: s.radiusMiles }, ageMin: 18, ageMax: 65, genders: "all", placements: "Advantage+ placements", optimization: "LINK_CLICKS", audiences: [], interests: [] },
    ads: metaAds(f, s),
    image: { alt: META_IMAGE_ALT, source: image },
    isSample: f.isSample,
  };
  return { ...body, check: checkMetaDraft(body, f) };
}

/** What she pastes into Ads Manager, field by field, as JSON. Paused; no pixel; no audiences. */
export function metaAdsSpec(d: MetaAdsDraft) {
  return {
    ...(d.isSample ? { note: "[Sample] Fictional demo practice. Not a real ad." } : {}),
    how_to_use: [
      "In Meta Ads Manager, create a campaign with the Traffic objective and leave it off (paused).",
      "Special ad categories: none apply to a therapy practice. Don't pick any audience or interest.",
      `Ad set: location ${d.adSet.location.label}, ${d.adSet.location.radiusMiles} mile radius; ages 18 to 65+; all genders; Advantage+ placements.`,
      `Budget: pick a lifetime budget of exactly the amount below, with the end date below (${META_RUN_DAYS} days). Meta stops spending when it reaches it. If you start later, move the end date to ${META_RUN_DAYS} days after you start.`,
      "Ads: paste each field below, and upload the picture from Practice-OS.",
      "Don't install the Meta Pixel on your site. Count consult bookings in your own calendar instead.",
      "Turn the campaign on yourself when you're ready. Practice-OS never does.",
    ],
    campaign: {
      name: d.campaign.name,
      objective: d.campaign.objective,
      status: d.campaign.status,
      special_ad_categories: [],
      budget_type: "lifetime",
      lifetime_budget: d.campaign.lifetimeBudgetCents === null ? null : usd(d.campaign.lifetimeBudgetCents),
      start_date: d.campaign.startDate,
      end_date: d.campaign.endDate,
    },
    ad_set: {
      location: d.adSet.location,
      age_min: d.adSet.ageMin,
      age_max: d.adSet.ageMax,
      genders: d.adSet.genders,
      placements: d.adSet.placements,
      optimization_goal: d.adSet.optimization,
      detailed_targeting: "none",
      custom_audiences: "none",
      lookalike_audiences: "none",
    },
    ads: d.ads.map((a) => ({ name: a.name, primary_text: a.primaryText, headline: a.headline, description: a.description, call_to_action: a.ctaLabel, website_url: a.url, image: "meta-ad.jpg", image_alt: d.image.alt })),
    policy_check: { passed: d.check.ok, checked_at: d.check.checkedAt },
  };
}
