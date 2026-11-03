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
// Her niche (Settings › Referrals, referral_settings.niche_preset) replaces the
// plain specialty points: the kind's catalog default_points times the niche's
// category weight and type boost (docs/research/referral-sources.json, judgment),
// clamped 0-35. A self-pay practice adds the catalog's session-capped boost for
// programs that hand clients off when their free sessions run out.
import research from "../../docs/research/referral-tiers.json" with { type: "json" };
import { catalogPoints, catalogSees, NICHE_PRESET_BY_ID, POINTS_MAX, SESSION_CAPPED_BOOST, typeForCode, SOURCE_TYPE_BY_ID, type SourceType } from "./catalog";
import { CATEGORY_LABELS } from "./categories";
import { looksResidential, specialtyForCode, type Provider, type SpecialtyId } from "./nppes";

export type Tier = "first" | "next" | "later";
export const TIERS: Tier[] = ["first", "next", "later"];

export type Weights = {
  labels: Record<Tier, string>;
  min: { first: number; next: number };
  /** The seven original kinds; kinds added with the source catalog use its default_points (pointsForSpecialty). */
  specialty: Partial<Record<SpecialtyId, number>>;
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
    ) as Partial<Record<SpecialtyId, number>>,
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
export const FOCUS_WORDS: Record<Focus, string> = {
  children: "children",
  teens: "teens",
  adults: "adults",
  older_adults: "older adults",
  couples: "couples",
  families: "families",
  perinatal: "new and expecting parents",
};

/**
 * Who each of the seven original kinds sees. "all" means every age. Kinds added
 * with the source catalog read `sees` from docs/research/referral-sources.json
 * (catalogSees); a kind with neither is treated as "not who you help" when she
 * has a focus (fail closed), so it can never rank first by accident.
 */
const SEES: Partial<Record<SpecialtyId, Focus[] | "all">> = {
  family_medicine: "all",
  psychiatry: "all",
  therapists: "all",
  // Pediatricians see new mothers at every newborn visit and screen them for postpartum depression (AAP).
  pediatrics: ["children", "teens", "families", "perinatal"],
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
  ["perinatal", /\b(perinatal|postpartum|pregnan\w*|new (?:moms?|mothers?|parents?)|new and expecting|expect(?:ing|ant) (?:parents?|moms?|mothers?)|maternal|fertility)\b/i],
];

// OB/GYN subspecialties that don't care for pregnancy (NUCC 207V*): no new or expecting parents there.
const GYN_ONLY = new Set(["207VF0040X", "207VG0400X", "207VC0200X", "207VH0002X", "207VB0002X", "207VC0300X"]);
// General OB/GYN, obstetrics and the women's health NP: where most new and expecting parents are seen.
const GENERAL_OB = new Set(["207V00000X", "207VX0000X", "363LX0001X"]);
/** Starts the reason for a general OB/GYN on a perinatal practice's card (focusRank reads it). */
export const GENERAL_OB_REASON = "general obstetrics sees most new and expecting parents";

function seesFor(specialty: SpecialtyId, taxonomy: string | null): Focus[] | "all" | undefined {
  if (specialty === "ob_gyn" && taxonomy && GYN_ONLY.has(taxonomy)) return ["adults", "older_adults"];
  return SEES[specialty] ?? (catalogSees(specialty) as Focus[] | "all" | null) ?? undefined;
}

/** The reason on a card whose kind has no "who they see" yet. Starts like the other mismatch reason. */
export const UNKNOWN_SEES_REASON = "mostly sees people Aeon can't match to who you help yet, so it stays Later";

/** True when a card's reasons say it doesn't see who she helps (or that's unknown). */
export function isMismatch(reasons: string[]): boolean {
  return reasons.some((x) => x.startsWith("mostly sees"));
}

/**
 * How closely a card's people match who she helps, for ordering inside a tier
 * (no points: the research has none for this). 0: a general OB/GYN for a
 * perinatal practice; 1: matches her focus; 2: sees all ages; 3: no focus known; 4: not who she helps.
 */
export function focusRank(r: Pick<TierResult, "reasons">): number {
  if (isMismatch(r.reasons)) return 4;
  // A kind her niche weights up comes first, with a general OB/GYN for a perinatal practice.
  if (r.reasons.some((x) => x.startsWith(NICHE_FIT))) return 0;
  if (r.reasons.some((x) => x.startsWith(GENERAL_OB_REASON))) return 0;
  if (r.reasons.some((x) => x.startsWith("matches your"))) return 1;
  if (r.reasons.some((x) => x.startsWith("sees all ages"))) return 2;
  if (isMismatch(r.reasons)) return 4;
  return 3;
}

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
  /** The practice location looks like a home (lib/referrals/nppes.ts looksResidential). */
  homeAddress?: boolean;
};

export type TierContext = {
  miles: number | null;
  focus: Focus[];
  approximate?: boolean;
  clinicianState?: string | null;
  today?: Date;
  /** Her niche preset id (referral_settings.niche_preset); an unknown id counts as none. */
  niche?: string | null;
  /** Her clients pay her themselves (selfPayFrom): session-capped programs get the catalog's boost. */
  selfPay?: boolean;
};
export type TierResult = {
  tier: Tier;
  score: number;
  reasons: string[];
  specialty: SpecialtyId | null;
  /** The catalog category (1 to 13) of the card's kind, or null when Aeon can't tell. */
  category?: number | null;
  /** Her niche's weight for this kind (category weight x type boost); only when she has a niche. Higher ranks first. */
  nicheWeight?: number;
};

// ---- her niche and her fees ------------------------------------------------------

/** How a card's reason names each niche: "Fits your oncology & end-of-life focus". */
export const NICHE_WORDS: Record<string, string> = {
  oncology_serious_illness: "oncology & end-of-life",
  grief_loss: "grief & loss",
  perinatal_reproductive: "perinatal & reproductive",
  children_teens_families: "children, teens & families",
  college_young_adults: "college & young adult",
  couples: "couples",
  trauma: "trauma",
  chronic_illness_pain: "chronic illness & pain",
  eating_disorders: "eating disorders",
  older_adults_caregivers: "older adults & caregivers",
  general_adult: "general adult",
};
/** Starts the reason on a card her niche weights up (focusRank reads it). */
export const NICHE_FIT = "Fits your ";

export function nicheWords(preset: string): string {
  return NICHE_WORDS[preset] ?? NICHE_PRESET_BY_ID.get(preset)?.label.toLowerCase() ?? preset;
}

/** A card's catalog kind: the type that owns its NUCC code, else the specialty's. */
export function sourceTypeFor(taxonomy: string | null, specialty: SpecialtyId | null): SourceType | null {
  return (
    (taxonomy ? typeForCode(taxonomy) : undefined) ??
    (specialty ? SOURCE_TYPE_BY_ID.get(specialty) : undefined) ??
    null
  );
}

/**
 * A kind's points under her niche: default_points times the category weight and
 * the type boost, clamped 0-35 (the same sum as catalog typesForNiche). Null when
 * the niche isn't in the catalog.
 */
export function nichePoints(preset: string, type: SourceType): { points: number; weight: number } | null {
  const p = NICHE_PRESET_BY_ID.get(preset);
  if (!p) return null;
  const weight = (p.category_weights[String(type.category)] ?? 1) * (p.type_boosts[type.id] ?? 1);
  const points = Math.min(POINTS_MAX, Math.max(0, Math.round(type.default_points * weight * 10) / 10));
  return { points, weight };
}

const SELF_PAY = /\b(self[- ]?pay|private[- ]?pay|pay (?:me )?(?:themselves|privately)|clients pay me|not in[- ]network|out[- ]of[- ]network)\b/i;
const TAKES_INSURANCE = /\b(takes? some insurance|in[- ]network with|i take (?:some )?insurance)\b/i;

/** Her real settings, for "do her clients pay her themselves?". */
export type FeeStance = {
  /** Payers she is in network with (payer_applications approved). */
  inNetwork: number;
  /** Her onboarding "Do you take insurance?" answer, as saved. */
  insurance: string | null | undefined;
  /** She has a fee schedule (Settings › Office hours and fees). */
  hasFees: boolean;
};

/**
 * Self-pay: in network with no payer, she didn't say she takes insurance, and
 * she said she's self-pay or has fees she charges clients herself. An in-network
 * practice (Aetna approved) is never self-pay.
 */
export function selfPayFrom(f: FeeStance): boolean {
  if (f.inNetwork > 0) return false;
  if (f.insurance && TAKES_INSURANCE.test(f.insurance)) return false;
  return SELF_PAY.test(f.insurance ?? "") || f.hasFees;
}

/**
 * The order of cards everywhere (the map's list, a search's saved best, the
 * board, the weekly plan): tier, then "not who you help" last, then how much
 * her niche weights the kind, then who-you-help fit, then score, then distance.
 */
export function compareTiers(a: { tier: TierResult; miles: number | null }, b: { tier: TierResult; miles: number | null }): number {
  return (
    TIERS.indexOf(a.tier.tier) - TIERS.indexOf(b.tier.tier) ||
    Number(isMismatch(a.tier.reasons)) - Number(isMismatch(b.tier.reasons)) ||
    (b.tier.nicheWeight ?? 1) - (a.tier.nicheWeight ?? 1) ||
    focusRank(a.tier) - focusRank(b.tier) ||
    b.tier.score - a.tier.score ||
    (a.miles ?? 99) - (b.miles ?? 99)
  );
}

/** The reason on a session-capped kind's card for a self-pay practice. */
export const SESSION_CAPPED_REASON = "their free sessions are capped, so they hand clients off to private-pay therapists like you";

/** `approximate`: one end is a ZIP center, not a street address. */
export function milesLabel(miles: number, approximate = false): string {
  if (miles < 0.1) return approximate ? "in your ZIP code" : "on your block";
  return `${approximate ? "about " : ""}${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}

const MANUAL_SOURCE_POINTS = 18; // research: sources not in NPPES default to 18

/** referral-tiers.json points for the seven original kinds; the source catalog's default_points for the rest. */
export function pointsForSpecialty(id: SpecialtyId): number {
  return SPECIALTY_POINTS[id] ?? catalogPoints(id) ?? MANUAL_SOURCE_POINTS;
}

/**
 * Why this kind refers, from the source catalog's `why_they_refer`: the type
 * that owns the exact code first (a geriatric family doctor gets geriatrics'
 * reason), else the type named like the specialty. A card reason: no final period.
 */
export function whyTheyRefer(taxonomy: string | null, specialty: SpecialtyId): string | null {
  const why = (taxonomy ? typeForCode(taxonomy) : undefined)?.why_they_refer ?? SOURCE_TYPE_BY_ID.get(specialty)?.why_they_refer;
  if (!why) return null;
  const text = why.trim().replace(/\.$/, "");
  // "Often the first stop…" reads as "often the first stop…"; "IBS and…" keeps its capitals.
  return /^[A-Z][a-z]/.test(text) ? text[0].toLowerCase() + text.slice(1) : text;
}

export function tierFor(p: TierInput, ctx: TierContext): TierResult {
  const specialty = p.taxonomy ? (specialtyForCode(p.taxonomy)?.id ?? null) : null;
  const reasons: string[] = [];
  let score = 0;

  // The kind: its catalog type (by exact code, else the specialty's) and her niche's weight for it.
  const type = sourceTypeFor(p.taxonomy, specialty);
  const niche = ctx.niche && NICHE_PRESET_BY_ID.has(ctx.niche) ? ctx.niche : null;
  const weighted = niche && type ? nichePoints(niche, type) : null;
  reasons.push((specialty && whyTheyRefer(p.taxonomy, specialty)) || "a kind of provider Aeon doesn't rank yet");
  const category = type?.category ?? null;
  if (weighted && type) {
    const label = CATEGORY_LABELS[type.category] ?? "";
    const words = nicheWords(niche!);
    if (weighted.weight > 1) reasons.push(`${NICHE_FIT}${words} focus (${label})`);
    else if (weighted.weight < 1) reasons.push(`${label}: less often a source for your ${words} focus`);
    else reasons.push(label);
  }

  // Who she helps: a reason, or "Later" when they only see people she doesn't.
  let mismatch = false;
  // A kind known only from the catalog (no NPI Registry specialty) uses the catalog's "who they see".
  const sees = specialty ? seesFor(specialty, p.taxonomy) : ((type?.sees as Focus[] | "all" | undefined) ?? undefined);
  if (ctx.focus.length > 0 && (specialty || type) && !sees) {
    // Fail closed: a kind with no "who they see" can't be ranked against her focus.
    mismatch = true;
    reasons.push(UNKNOWN_SEES_REASON);
  } else if (ctx.focus.length > 0 && sees) {
    const shared = sees === "all" ? [] : ctx.focus.filter((f) => sees.includes(f));
    if (sees === "all") reasons.push("sees all ages, so your clients too");
    else if (shared.length > 0) {
      reasons.push(`matches your ${shared.map((f) => FOCUS_WORDS[f]).join(" and ")} focus`);
      if (shared.includes("perinatal") && p.taxonomy && GENERAL_OB.has(p.taxonomy)) reasons.push(GENERAL_OB_REASON);
    }
    else {
      mismatch = true;
      reasons.push(`mostly sees ${sees.map((f) => FOCUS_WORDS[f]).join(" and ")}, not who you help`);
    }
  }

  // Specialty points: her niche's for this kind when she picked one, else the plain ones. Programs
  // with a session cap hand clients off when it runs out: a boost for a self-pay practice, added
  // before the 35 cap, and never for a kind that doesn't see who she helps (or can't be told).
  let kindPoints = weighted ? weighted.points : specialty ? pointsForSpecialty(specialty) : MANUAL_SOURCE_POINTS;
  if (ctx.selfPay && !mismatch && type?.session_capped && SESSION_CAPPED_BOOST > 0) {
    kindPoints += SESSION_CAPPED_BOOST;
    reasons.push(SESSION_CAPPED_REASON);
  }
  score += Math.min(POINTS_MAX, kindPoints);

  // Distance.
  if (ctx.miles === null) {
    score += WEIGHTS.distance.unknown;
    reasons.push("distance unknown");
  } else {
    score += Math.max(0, Math.round(WEIGHTS.distance.max - WEIGHTS.distance.perMile * ctx.miles));
    const where = milesLabel(ctx.miles, ctx.approximate);
    reasons.push(where.endsWith("mi") ? `${where} from your office` : where);
  }

  // A person to write to. A home address can't take a letter to a practice,
  // so it counts as low as a front desk: call first.
  if (p.homeAddress) {
    score += WEIGHTS.reachable.groupOnly;
    reasons.push("the address looks like a home, so call before you write");
  } else if (p.npiType === "individual") {
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
  // A home address can't be the first letter you send: at best "Warm up next", after a call.
  let tier: Tier = mismatch ? "later" : tierOf(score);
  if (tier === "first" && p.homeAddress) tier = "next";
  return { tier, score, reasons, specialty, category, ...(weighted ? { nicheWeight: weighted.weight } : {}) };
}

/** The tier of a provider straight from NPPES. */
export function providerTier(p: Provider, ctx: TierContext, worksAt: string | null = null): TierResult {
  return tierFor(
    { taxonomy: p.taxonomy, npiType: p.npiType, name: p.name, official: p.official, phone: p.phone, fax: p.fax, lastUpdated: p.lastUpdated, state: p.state, worksAt, homeAddress: p.homeAddress },
    ctx,
  );
}

/**
 * Which scoring wrote a card's fit_score. 1 was the first fit formula (before
 * 2026-10-29); 2 is these research weights; 3 scores a home-looking address lower; 4 adds her niche and the session-capped boost. Bump it when the weights change,
 * and old cards are scored again (lib/referrals/store.ts rescoreOldCards).
 */
export const SCORE_VERSION = 4;

/** Niche ids fold into 300 buckets, so a version stays a smallint (at most 4 + 30,000). */
const NICHE_BUCKETS = 300;

/**
 * The score_version a card scored for this niche carries: SCORE_VERSION with no
 * niche, else SCORE_VERSION + 100 x (a stable bucket of the niche id). A saved
 * score counts only when it was written for her current niche, so a search that
 * finishes after she changed niche can't leave old-niche scores marked current
 * (no migration: the niche rides in the existing column).
 */
export function scoreVersionFor(niche: string | null | undefined): number {
  if (!niche || !NICHE_PRESET_BY_ID.has(niche)) return SCORE_VERSION;
  let h = 0;
  for (const ch of niche) h = (h * 31 + ch.charCodeAt(0)) % NICHE_BUCKETS;
  return SCORE_VERSION + 100 * (h + 1);
}

/**
 * A board card: its reasons from what the board keeps, and its tier from the
 * score saved when it was found (that one saw the whole NPPES record: fax,
 * named contact, record age), but only if this scoring wrote it. A "not who
 * you help" card stays Later.
 */
export function boardTier(
  card: {
    taxonomy: string | null;
    npi_type: "individual" | "organization" | null;
    phone: string | null;
    state: string | null;
    address: string | null;
    fit_score: number | null;
    score_version: number | null;
    distance_miles: number | null;
  },
  ctx: Omit<TierContext, "miles">,
): TierResult {
  const homeAddress = card.npi_type !== "organization" && looksResidential(card.address);
  const r = tierFor(
    { taxonomy: card.taxonomy, npiType: card.npi_type, phone: card.phone, state: card.state, homeAddress },
    { ...ctx, miles: card.distance_miles },
  );
  const mismatch = isMismatch(r.reasons);
  if (card.fit_score === null || card.score_version !== scoreVersionFor(ctx.niche) || mismatch) return r;
  return { ...r, score: card.fit_score, tier: tierOf(card.fit_score) };
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

// ---- the relationship, from her contact log ---------------------------------
// referral-tiers.json "relationship_modifiers": points added after the sum, from
// what she logged (lib/referrals/contacts.ts), never from NPPES.

export type RelationshipInput = { warmIntro: boolean; referredBefore: boolean; met: boolean; replied: boolean };
type Modifier = keyof RelationshipInput;
const MODIFIER_KEYS: Record<Modifier, string> = {
  warmIntro: "warm_intro_available",
  referredBefore: "sent_us_a_referral_before",
  met: "met_in_person",
  replied: "replied_to_letter",
};
// The same numbers and words as referral-tiers.json v1.0, used only if that file can't be read.
const BUILT_IN_MODIFIERS: Record<Modifier, { points: number; reason: string }> = {
  referredBefore: { points: 20, reason: "They have sent you a client before: thank them and keep the line open." },
  warmIntro: { points: 15, reason: "You know someone who can introduce you." },
  met: { points: 10, reason: "You have met." },
  replied: { points: 8, reason: "They answered your letter." },
};

export function readModifiers(json: unknown): Record<Modifier, { points: number; reason: string }> {
  const m = (json as { relationship_modifiers?: { add_points?: Record<string, unknown>; reasons?: Record<string, unknown> } }).relationship_modifiers;
  const out = {} as Record<Modifier, { points: number; reason: string }>;
  for (const [k, key] of Object.entries(MODIFIER_KEYS) as [Modifier, string][]) {
    const points = m?.add_points?.[key];
    const reason = m?.reasons?.[key];
    if (typeof points !== "number" || typeof reason !== "string") throw new Error(`relationship modifier ${key} is missing`);
    out[k] = { points, reason };
  }
  return out;
}

function loadModifiers() {
  try {
    return readModifiers(research);
  } catch (err) {
    console.error(`[referrals] docs/research/referral-tiers.json: ${err instanceof Error ? err.message : String(err)}. Using the built-in modifiers.`);
    return BUILT_IN_MODIFIERS;
  }
}
export const MODIFIERS = loadModifiers();

/** The tier with what her log says added on top: a prior referral, a warm intro, a meeting, a reply. */
export function withRelationship(r: TierResult, rel: RelationshipInput): TierResult {
  const order: Modifier[] = ["referredBefore", "warmIntro", "met", "replied"];
  const on = order.filter((k) => rel[k]);
  if (on.length === 0) return r;
  const score = Math.min(100, r.score + on.reduce((n, k) => n + MODIFIERS[k].points, 0));
  // "Not who you help" stays Later unless they have already referred to her.
  const mismatch = isMismatch(r.reasons);
  const tier: Tier = mismatch && !rel.referredBefore ? "later" : tierOf(score);
  return { ...r, score, tier, reasons: [r.reasons[0], ...on.map((k) => MODIFIERS[k].reason.replace(/\.$/, "")), ...r.reasons.slice(1)] };
}
