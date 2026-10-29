// Who to reach out to first, in plain code (never the model), with the reasons
// shown on every card. The points and tier lines come from the referral
// research, docs/research/referral-tiers.json (v1.0, merged in #67), so a new
// version of that file changes the numbers without touching this code:
//   specialty         up to 35  how often that field sees people who need therapy
//   distance          up to 25  25 at her door, 5 fewer per mile
//   reachable person  up to 15  a named clinician reads a letter; a big group's front desk rarely does
//   contact           up to 10  office phone (6) and fax (4) at the practice location
//   record fresh      up to 10  NPPES record updated in the last 2 years (10), 2 to 5 (4)
//   location state    up to 5   the practice location is in her state
// Tiers: "Reach out first" at 70 or more, "Warm up next" at 50 or more, else "Later".
// Isaiah also asked to match who she helps (onboarding "Who you help"). The
// research has no points for that, so it adds no points: it adds a reason when
// they see the same people, and a provider who only sees people she doesn't
// (a pediatrician for an adults-only practice) is always "Later".
import research from "../../docs/research/referral-tiers.json";
import { specialtyForCode, SPECIALTY_BY_ID, type Provider, type SpecialtyId } from "./nppes";

export type Tier = "first" | "next" | "later";
export const TIERS: Tier[] = ["first", "next", "later"];

export type Weights = {
  labels: Record<Tier, string>;
  min: { first: number; next: number };
  specialty: Record<SpecialtyId, number>;
  distance: { max: number; perMile: number; unknown: number };
  reachable: { individual: number; namedOfficial: number; groupOnly: number };
  contact: { phone: number; fax: number };
  fresh: { within2y: number; from2to5y: number; older: number; flagYears: number };
  inState: number;
};

// The same numbers as referral-tiers.json v1.0, used only if that file can't be read.
export const BUILT_IN_WEIGHTS: Weights = {
  labels: { first: "Reach out first", next: "Warm up next", later: "Later" },
  min: { first: 70, next: 50 },
  specialty: { family_medicine: 35, pediatrics: 33, ob_gyn: 32, psychiatry: 30, internal_medicine: 30, oncology: 22, therapists: 20 },
  distance: { max: 25, perMile: 5, unknown: 8 },
  reachable: { individual: 15, namedOfficial: 8, groupOnly: 3 },
  contact: { phone: 6, fax: 4 },
  fresh: { within2y: 10, from2to5y: 4, older: 0, flagYears: 5 },
  inState: 5,
};

/** The research file to weights. Throws, saying what is missing, if its shape changed. */
export function readWeights(json: unknown): Weights {
  const doc = json as { tiers?: { id: string; label: string; min: number }[]; factors?: { id: string; max?: number; points?: Record<string, number>; per_mile?: number; unknown_distance_points?: number; flag_if_older_than_years?: number }[] };
  const tier = (id: string) => {
    const t = doc.tiers?.find((x) => x.id === id);
    if (!t || typeof t.label !== "string" || typeof t.min !== "number") throw new Error(`tier ${id} is missing`);
    return t;
  };
  const factor = (id: string) => {
    const f = doc.factors?.find((x) => x.id === id);
    if (!f) throw new Error(`factor ${id} is missing`);
    return f;
  };
  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`${what} is not a number`);
    return v;
  };
  const specialtyPoints = factor("specialty").points ?? {};
  const distance = factor("distance");
  const reach = factor("reachable_person").points ?? {};
  const contact = factor("contact").points ?? {};
  const fresh = factor("record_fresh");
  const state = factor("location_state").points ?? {};
  return {
    labels: { first: tier("A").label, next: tier("B").label, later: tier("C").label },
    min: { first: num(tier("A").min, "tier A min"), next: num(tier("B").min, "tier B min") },
    specialty: Object.fromEntries(
      (Object.keys(BUILT_IN_WEIGHTS.specialty) as SpecialtyId[]).map((id) => [id, num(specialtyPoints[id], `specialty ${id}`)]),
    ) as Record<SpecialtyId, number>,
    distance: { max: num(distance.max, "distance max"), perMile: num(distance.per_mile, "distance per_mile"), unknown: num(distance.unknown_distance_points, "distance unknown") },
    reachable: {
      individual: num(reach.individual, "reachable individual"),
      namedOfficial: num(reach.organization_with_named_official, "reachable named official"),
      groupOnly: num(reach.organization_only, "reachable organization only"),
    },
    contact: { phone: num(contact.location_phone, "contact phone"), fax: num(contact.location_fax, "contact fax") },
    fresh: {
      within2y: num(fresh.points?.updated_within_2y, "fresh within 2y"),
      from2to5y: num(fresh.points?.updated_2_to_5y, "fresh 2 to 5y"),
      older: num(fresh.points?.older, "fresh older"),
      flagYears: num(fresh.flag_if_older_than_years, "fresh flag years"),
    },
    inState: num(state.practice_location_in_clinician_state, "location state"),
  };
}

function loadWeights(): Weights {
  try {
    return readWeights(research);
  } catch (err) {
    // A renamed key in the research file must not take down the chat tools.
    console.error(`[referrals] docs/research/referral-tiers.json: ${err instanceof Error ? err.message : String(err)}. Using the built-in weights.`);
    return BUILT_IN_WEIGHTS;
  }
}

export const WEIGHTS = loadWeights();
export const TIER_LABEL = WEIGHTS.labels;
export const SPECIALTY_POINTS = WEIGHTS.specialty;
const tierOf = (score: number): Tier => (score >= WEIGHTS.min.first ? "first" : score >= WEIGHTS.min.next ? "next" : "later");

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

/** Who each kind of provider sees. "all" means every age. */
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
  /** NUCC primary taxonomy code. Unknown or unmatched codes score as a manual source would. */
  taxonomy: string | null;
  npiType: "individual" | "organization" | null;
  /** The person's own name, or a group's authorized official from NPPES. */
  name?: string | null;
  official?: string | null;
  phone?: string | null;
  fax?: string | null;
  lastUpdated?: string | null;
  /** The practice location's state. */
  state?: string | null;
  /** A group at the same address in the NPI Registry, for a person. Shown, not scored. */
  worksAt?: string | null;
};

export type TierContext = { miles: number | null; focus: Focus[]; approximate?: boolean; clinicianState?: string | null; today?: Date };
export type TierResult = { tier: Tier; score: number; reasons: string[]; specialty: SpecialtyId | null };

/** `approximate`: one end is a ZIP center, not a street address. */
export function milesLabel(miles: number, approximate = false): string {
  if (miles < 0.1) return approximate ? "in your ZIP code" : "on your block";
  return `${approximate ? "about " : ""}${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

const MANUAL_SOURCE_POINTS = 18; // research: sources not in NPPES default to 18

export function tierFor(p: TierInput, ctx: TierContext): TierResult {
  const specialty = p.taxonomy ? (specialtyForCode(p.taxonomy)?.id ?? null) : null;
  const reasons: string[] = [];
  let score = 0;

  // Specialty.
  score += specialty ? SPECIALTY_POINTS[specialty] : MANUAL_SOURCE_POINTS;
  reasons.push(
    specialty
      ? `${SPECIALTY_BY_ID.get(specialty)!.label} offices see people who need talk therapy and often have no one to send them to`
      : "a kind of provider Aeon doesn't rank yet",
  );

  // Who she helps: a reason, or "Later" when they only see people she doesn't.
  let mismatch = false;
  if (ctx.focus.length > 0 && specialty) {
    const sees = SEES[specialty];
    const shared = sees === "all" ? [] : ctx.focus.filter((f) => sees.includes(f));
    if (sees === "all") reasons.push("sees all ages, so your clients too");
    else if (shared.length > 0) reasons.push(`matches your ${shared.map((f) => FOCUS_WORDS[f]).join(" and ")} focus`);
    else {
      mismatch = true;
      reasons.push(`mostly sees ${sees.map((f) => FOCUS_WORDS[f]).join(" and ")}, not who you help`);
    }
  }

  // Distance.
  if (ctx.miles === null) {
    score += WEIGHTS.distance.unknown;
    reasons.push("distance unknown");
  } else {
    score += Math.max(0, Math.round(WEIGHTS.distance.max - WEIGHTS.distance.perMile * ctx.miles));
    const where = milesLabel(ctx.miles, ctx.approximate);
    reasons.push(where.endsWith("mi") ? `${where} from your office` : where);
  }

  // A person to write to.
  if (p.npiType === "individual") {
    score += WEIGHTS.reachable.individual;
    reasons.push("you can write to them by name, not a front desk");
  } else if (p.official) {
    score += WEIGHTS.reachable.namedOfficial;
    reasons.push(`a group; you can write to ${p.official} by name`);
  } else {
    score += WEIGHTS.reachable.groupOnly;
    reasons.push("a group with no named contact, so the letter goes to a front desk");
  }
  if (p.worksAt) reasons.push(`works at ${p.worksAt}`);

  // Phone and fax at the practice location.
  if (p.phone) score += WEIGHTS.contact.phone;
  if (p.fax) score += WEIGHTS.contact.fax;
  if (p.phone || p.fax) reasons.push(`office ${[p.phone && "phone", p.fax && "fax"].filter(Boolean).join(" and ")} on file`);

  // How fresh the NPPES record is.
  const updated = p.lastUpdated ? new Date(p.lastUpdated) : null;
  if (updated && !Number.isNaN(updated.getTime())) {
    const years = ((ctx.today ?? new Date()).getTime() - updated.getTime()) / (365.25 * 24 * 3600 * 1000);
    score += years < 2 ? WEIGHTS.fresh.within2y : years < 5 ? WEIGHTS.fresh.from2to5y : WEIGHTS.fresh.older;
    if (years >= WEIGHTS.fresh.flagYears) reasons.push(`record last updated ${updated.getFullYear()}; confirm they still practice before writing`);
  }

  // Practice location in her state.
  if (p.state && ctx.clinicianState && p.state.toUpperCase() === ctx.clinicianState.toUpperCase()) score += WEIGHTS.inState;

  score = Math.min(100, Math.round(score));
  const tier: Tier = mismatch ? "later" : tierOf(score);
  return { tier, score, reasons, specialty };
}

/** The tier of a provider straight from NPPES. */
export function providerTier(p: Provider, ctx: TierContext, worksAt: string | null = null): TierResult {
  return tierFor(
    { taxonomy: p.taxonomy, npiType: p.npiType, name: p.name, official: p.official, phone: p.phone, fax: p.fax, lastUpdated: p.lastUpdated, state: p.state, worksAt },
    ctx,
  );
}

/**
 * "Reach out first" is a short list: at most `max` per search, the best scores
 * (the list comes in sorted). A strong fit past that moves down a tier, and says so.
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
