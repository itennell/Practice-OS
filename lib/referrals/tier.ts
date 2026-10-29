// Who to reach out to first, in plain code (never the model), with the reasons
// shown on every card. Four parts, 100 points in all:
//   specialty   up to 40  how routinely that field sends people to a therapist
//   fit         up to 25  whether they see the people she helps (onboarding "Who you help")
//   distance    up to 25  25 at her door, 2.5 fewer per mile, 0 at 10 miles
//   practice    up to 10  a clinic or group (one letter reaches several clinicians)
// Tiers: "Reach out first" at 75 or more, "Next" at 55 or more, else "Later".
// A provider who only sees people she doesn't (a pediatrician for an adults-only
// practice) is always "Later", whatever the points say.
//
// The specialty weights are Aeon's starting judgment, ranked by how firmly each
// field's own guidelines tell it to screen for mental health and refer on.
// Research hook: when docs/research.md gains a referral-sources section with
// measured referral rates, replace these numbers and their `why` lines there.
import { specialtyForCode, type SpecialtyId } from "./nppes";

export type Tier = "first" | "next" | "later";
export const TIERS: Tier[] = ["first", "next", "later"];
export const TIER_LABEL: Record<Tier, string> = { first: "Reach out first", next: "Next", later: "Later" };

export type Focus = "children" | "teens" | "adults" | "older_adults" | "couples" | "families" | "perinatal";
const FOCUS_WORDS: Record<Focus, string> = {
  children: "children",
  teens: "teens",
  adults: "adults",
  older_adults: "older adults",
  couples: "couples",
  families: "families",
  perinatal: "new and expecting parents",
};

type Weight = { points: number; refers: string; source: string };

export const SPECIALTY_WEIGHTS: Record<SpecialtyId, Weight> = {
  family_medicine: {
    points: 40,
    refers: "primary care screens adults for depression and anxiety",
    source: "USPSTF: Depression and Suicide Risk in Adults, and Anxiety Disorders in Adults, screening recommendations (2023)",
  },
  psychiatry: {
    points: 38,
    refers: "psychiatrists often manage medication and send therapy out",
    source: "APA Practice Guideline for Major Depressive Disorder, 3rd ed. (2010): psychotherapy alongside medication",
  },
  pediatrics: {
    points: 36,
    refers: "pediatricians are often the first stop for a child's or teen's mental health",
    source: "AAP: Mental Health Competencies for Pediatric Practice, Pediatrics 2019;144(5):e20192757",
  },
  internal_medicine: {
    points: 34,
    refers: "primary care screens adults for depression and anxiety",
    source: "USPSTF adult depression and anxiety screening recommendations (2023)",
  },
  ob_gyn: {
    points: 34,
    refers: "OB-GYNs screen for depression in pregnancy and after birth",
    source: "ACOG Clinical Practice Guideline No. 4 (2023): mental health conditions in pregnancy and postpartum",
  },
  oncology: {
    points: 26,
    refers: "cancer teams screen patients for distress",
    source: "NCCN Guidelines: Distress Management",
  },
  therapists: {
    points: 22,
    refers: "therapists pass people on when they're full or it's outside their focus",
    source: "Aeon's judgment; no published rate",
  },
};

/** Who each kind of provider sees. "all" means every age, so it fits any practice a little. */
const SEES: Record<SpecialtyId, Focus[] | "all"> = {
  family_medicine: "all",
  psychiatry: "all",
  therapists: "all",
  pediatrics: ["children", "teens", "families"],
  internal_medicine: ["adults", "older_adults"],
  ob_gyn: ["adults", "perinatal", "couples"],
  oncology: ["adults", "older_adults"],
};

const FOCUS_PATTERNS: [Focus, RegExp][] = [
  ["children", /\b(child|children|kids?|elementary)\b/i],
  ["teens", /\b(teens?|teenagers?|adolescents?|youth|high school|young people)\b/i],
  ["older_adults", /\b(older adults?|seniors?|aging|elder\w*|retire\w*)\b/i],
  ["adults", /\b(adults?|college students?|professionals?|grown-ups?)\b/i],
  ["couples", /\b(couples?|partners?|marriage|marital)\b/i],
  ["families", /\b(famil(y|ies)|parents?|parenting)\b/i],
  ["perinatal", /\b(perinatal|postpartum|pregnan\w*|new (?:moms?|mothers?|parents?)|maternal|fertility)\b/i],
];

/** Her "Who you help" answer (chips and her own words) to the groups we can match. */
export function focusFrom(text: string | null | undefined): Focus[] {
  if (!text) return [];
  // "older adults" shouldn't also count as plain "adults".
  const plain = text.replace(/older adults?/gi, "older_adults");
  return FOCUS_PATTERNS.filter(([f, re]) => (f === "adults" ? re.test(plain) : re.test(text))).map(([f]) => f);
}

export type TierInput = {
  /** NUCC primary taxonomy code. Unknown or unmatched codes score as "other". */
  taxonomy: string | null;
  npiType: "individual" | "organization" | null;
  /** A group at the same address in the NPI Registry, for a person. */
  worksAt?: string | null;
};

export type TierResult = { tier: Tier; score: number; reasons: string[]; specialty: SpecialtyId | null };

/** `approximate`: one end is a ZIP center, not a street address. */
export function milesLabel(miles: number, approximate = false): string {
  if (miles < 0.1) return approximate ? "in your ZIP code" : "on your block";
  return `${approximate ? "about " : ""}${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

export function tierFor(p: TierInput, ctx: { miles: number | null; focus: Focus[]; approximate?: boolean }): TierResult {
  const specialty = p.taxonomy ? (specialtyForCode(p.taxonomy)?.id ?? null) : null;
  const weight = specialty ? SPECIALTY_WEIGHTS[specialty] : null;
  const reasons: string[] = [];

  const specialtyPoints = weight?.points ?? 10;
  reasons.push(weight ? weight.refers : "a specialty that rarely refers to therapy");

  let fitPoints = 12;
  let mismatch = false;
  if (ctx.focus.length > 0 && specialty) {
    const sees = SEES[specialty];
    const shared = sees === "all" ? [] : ctx.focus.filter((f) => sees.includes(f));
    if (sees === "all") {
      fitPoints = 20;
      reasons.push("sees all ages, so your clients too");
    } else if (shared.length > 0) {
      fitPoints = 25;
      reasons.push(`matches your ${shared.map((f) => FOCUS_WORDS[f]).join(" and ")} focus`);
    } else {
      fitPoints = 0;
      mismatch = true;
      reasons.push(`mostly sees ${sees.map((f) => FOCUS_WORDS[f]).join(" and ")}, not who you help`);
    }
  }

  const distancePoints = ctx.miles === null ? 8 : Math.max(0, Math.round(25 - 2.5 * ctx.miles));
  const where = ctx.miles === null ? null : milesLabel(ctx.miles, ctx.approximate);
  reasons.push(where === null ? "distance unknown" : where.endsWith("mi") ? `${where} from your office` : where);

  let practicePoints = 3;
  if (p.npiType === "organization") {
    practicePoints = 10;
    reasons.push("a clinic or group, so one letter reaches several clinicians");
  } else if (p.worksAt) {
    practicePoints = 6;
    reasons.push(`works at ${p.worksAt}`);
  }

  const score = Math.min(100, specialtyPoints + fitPoints + distancePoints + practicePoints);
  const tier: Tier = mismatch ? "later" : score >= 75 ? "first" : score >= 55 ? "next" : "later";
  return { tier, score, reasons, specialty };
}

/**
 * "Reach out first" is a short list: at most `max` per search, the best scores
 * (the list comes in sorted). A strong fit past that is "Next", and says so.
 */
export const FIRST_MAX = 12;
export function capFirst<T extends { tier: TierResult }>(sorted: T[], max = FIRST_MAX): T[] {
  let firsts = 0;
  return sorted.map((p) => {
    if (p.tier.tier !== "first") return p;
    firsts++;
    if (firsts <= max) return p;
    return { ...p, tier: { ...p.tier, tier: "next" as const, reasons: [...p.tier.reasons, `a strong fit, after your top ${max} in this search`] } };
  });
}

/** The short line on a card: "Pediatrics · 0.8 mi · matches your teens focus". */
export function shortReasons(label: string | null, r: TierResult, miles: number | null, approximate = false): string {
  const fit = r.reasons.find((x) => x.startsWith("matches your") || x.startsWith("mostly sees"));
  return [label, miles === null ? null : milesLabel(miles, approximate), fit].filter(Boolean).join(" · ");
}
