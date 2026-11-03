// Every kind of referral source Aeon knows about, from the research file
// docs/research/referral-sources.json (v1.0), read the way tier.ts reads
// referral-tiers.json: a new version of that file changes the list, points and
// niche weights without touching this code. 13 categories (primary care through
// special populations), each source type with how it can be found (NPPES, a CMS
// dataset, OpenStreetMap tags, a public list, or by hand), its default points,
// the niches it belongs to, and whether it is session-capped or sensitive.
// Weights in the file are judgment calls and say so. Tier scoring (tier.ts)
// weights default_points by her niche preset and reads default_points for the kinds it
// has no points for.
import { z } from "zod";
import research from "../../docs/research/referral-sources.json" with { type: "json" };
import { SPECIALTY_BY_ID, type SpecialtyId } from "./nppes";

const ID = /^[a-z_]+$/;
const NUCC = /^[0-9]{3}[0-9A-Z]{6}X$/;
const id = z.string().regex(ID);
const category = z.number().int().min(1).max(13);
const channel = z.enum(["nppes", "cms_dataset", "osm_tags", "public_list", "manual"]);
const weight = z.number().min(0).max(3);
/** The groups tier.ts matches against "Who you help" (its Focus type). */
export const FOCUS_IDS = ["children", "teens", "adults", "older_adults", "couples", "families", "perinatal"] as const;
const sees = z.union([z.literal("all"), z.array(z.enum(FOCUS_IDS)).min(1)]);
/** Points on the same 0-35 scale as the specialty factor in referral-tiers.json. */
export const POINTS_MAX = 35;
/** Judgment points never outrank the researched originals before niche weighting: at most the therapists' 20. */
export const JUDGMENT_POINTS_MAX = 20;

const SourceTypeSchema = z
  .object({
    id,
    label: z.string().min(1),
    category,
    why_they_refer: z.string().min(1),
    findable_via: channel,
    also_findable_via: z.array(channel).optional(),
    /** The SPECIALTIES ids (lib/referrals/nppes.ts) whose searches find this type. */
    nppes_specialties: z.array(z.string()).optional(),
    /** An NPPES type found by another type's codes (group practices: the therapists' codes, from NPI-2 records). Scoring uses the owner. */
    shared_with: id.optional(),
    nppes_searches: z.array(z.string().min(1)).optional(),
    nucc_codes: z.array(z.string().regex(NUCC)).optional(),
    osm_tags: z.record(z.union([z.string(), z.array(z.string())])).optional(),
    cms_dataset: z.object({ id: z.string().regex(/^[a-z0-9]{4}-[a-z0-9]{4}$/), title: z.string(), url: z.string().url() }).optional(),
    default_points: z.number().min(0).max(POINTS_MAX),
    /** "research": the points come from referral-tiers.json; "judgment": ours, capped at JUDGMENT_POINTS_MAX. */
    points_basis: z.enum(["research", "judgment"]),
    /** "judgment", or the URL of a source that backs why_they_refer. */
    why_basis: z.string().min(1),
    /** Who they see, for "Who you help" (required for every kind in lib/referrals/nppes.ts SPECIALTIES). */
    sees: sees.optional(),
    niches: z.array(id),
    session_capped: z.boolean(),
    sensitive: z.boolean(),
    talk_track: z.object({ they_need: z.string().min(1), you_offer: z.string().min(1) }),
    note: z.string().optional(),
  })
  .superRefine((t, ctx) => {
    const via = [t.findable_via, ...(t.also_findable_via ?? [])];
    const nppes = via.includes("nppes");
    if (nppes && !((t.nucc_codes?.length || t.shared_with) && t.nppes_searches?.length && t.nppes_specialties?.length))
      ctx.addIssue({ code: "custom", message: `${t.id}: an NPPES type needs nucc_codes (or shared_with), nppes_searches and nppes_specialties` });
    if (t.points_basis === "judgment" && t.default_points > JUDGMENT_POINTS_MAX)
      ctx.addIssue({ code: "custom", message: `${t.id}: judgment points are at most ${JUDGMENT_POINTS_MAX}` });
    if (!nppes && (t.nucc_codes || t.nppes_searches || t.nppes_specialties || t.shared_with))
      ctx.addIssue({ code: "custom", message: `${t.id}: NUCC codes are only for NPPES types` });
    if (via.includes("osm_tags") !== Boolean(t.osm_tags)) ctx.addIssue({ code: "custom", message: `${t.id}: osm_tags goes with findable_via osm_tags` });
    if (via.includes("cms_dataset") !== Boolean(t.cms_dataset)) ctx.addIssue({ code: "custom", message: `${t.id}: cms_dataset goes with findable_via cms_dataset` });
  });

const PresetSchema = z.object({
  id,
  label: z.string().min(1),
  /** Category id ("1" to "13") to a multiplier on default_points. 1 is neutral. */
  category_weights: z.record(z.string().regex(/^(?:[1-9]|1[0-3])$/), weight),
  /** Source type id to an extra multiplier. */
  type_boosts: z.record(id, weight),
});

export const CatalogSchema = z
  .object({
    version: z.string(),
    updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    status: z.string().min(1),
    sources: z.array(z.object({ what: z.string(), url: z.string() })).min(1),
    categories: z.array(z.object({ id: category, label: z.string().min(1) })).length(13),
    types: z.array(SourceTypeSchema).min(1),
    niche_presets: z.object({ judgment: z.literal(true), note: z.string(), presets: z.array(PresetSchema).min(1) }),
    session_capped_boost: z.object({ judgment: z.literal(true), points: z.number().min(0).max(20), applies_when: z.string(), note: z.string() }),
    nppes_verification: z.record(
      z.object({ il_results: z.number().int().positive(), of: z.number().int(), limit: z.number().int(), checked: z.string(), codes_returned: z.array(z.string().regex(NUCC)) }),
    ),
  })
  .superRefine((doc, ctx) => {
    const types = new Set<string>();
    for (const t of doc.types) {
      if (types.has(t.id)) ctx.addIssue({ code: "custom", message: `duplicate type ${t.id}` });
      types.add(t.id);
    }
    const owner = new Map<string, string>();
    for (const t of doc.types) {
      for (const c of t.nucc_codes ?? []) {
        if (owner.has(c)) ctx.addIssue({ code: "custom", message: `${t.id}: code ${c} is already ${owner.get(c)}'s (use shared_with)` });
        owner.set(c, t.id);
      }
    }
    for (const t of doc.types) {
      if (t.shared_with && !doc.types.some((o) => o.id === t.shared_with && o.nucc_codes?.length))
        ctx.addIssue({ code: "custom", message: `${t.id}: shared_with ${t.shared_with} is not an NPPES type with codes` });
      // Every kept code came back from one of the type's own searches.
      for (const c of t.nucc_codes ?? [])
        if (!(t.nppes_searches ?? []).some((s) => doc.nppes_verification[s]?.codes_returned.includes(c)))
          ctx.addIssue({ code: "custom", message: `${t.id}: code ${c} was not returned by its own searches` });
    }
    const used = new Set(doc.types.flatMap((t) => t.nppes_searches ?? []));
    for (const s of Object.keys(doc.nppes_verification)) if (!used.has(s)) ctx.addIssue({ code: "custom", message: `verified search "${s}" is not used` });
    const presets = new Set(doc.niche_presets.presets.map((p) => p.id));
    for (const t of doc.types) {
      for (const n of t.niches) if (!presets.has(n)) ctx.addIssue({ code: "custom", message: `${t.id}: unknown niche ${n}` });
      for (const s of t.nppes_searches ?? []) if (!doc.nppes_verification[s]) ctx.addIssue({ code: "custom", message: `${t.id}: search "${s}" was not verified` });
    }
    for (const p of doc.niche_presets.presets) {
      for (const k of Object.keys(p.category_weights)) if (!doc.categories.some((c) => String(c.id) === k)) ctx.addIssue({ code: "custom", message: `${p.id}: unknown category ${k}` });
      for (const k of Object.keys(p.type_boosts)) if (!types.has(k)) ctx.addIssue({ code: "custom", message: `${p.id}: unknown type ${k}` });
    }
  });

export type Catalog = z.infer<typeof CatalogSchema>;
export type SourceType = Catalog["types"][number];
export type NichePreset = Catalog["niche_presets"]["presets"][number];
export type CategoryId = number;

/** The research file, checked. Throws, saying what is wrong, if its shape changed. */
export function readCatalog(json: unknown): Catalog {
  const parsed = CatalogSchema.safeParse(json);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => `${i.path.join(".") || "file"}: ${i.message}`).join("; "));
  return parsed.data;
}

function loadCatalog(): Catalog | null {
  try {
    return readCatalog(research);
  } catch (err) {
    // A bad research file must not take down the chat tools: the catalog is empty and tier.ts keeps its own points.
    console.error(`[referrals] docs/research/referral-sources.json: ${err instanceof Error ? err.message : String(err)}. The source catalog is off.`);
    return null;
  }
}

export const CATALOG = loadCatalog();
export const SOURCE_TYPES: SourceType[] = CATALOG?.types ?? [];
export const SOURCE_TYPE_BY_ID = new Map(SOURCE_TYPES.map((t) => [t.id, t]));
/** Each NUCC code's one owning type (codes are unique per type in the file), so type-level scoring is deterministic. */
const TYPE_BY_CODE = new Map(SOURCE_TYPES.flatMap((t) => (t.nucc_codes ?? []).map((c) => [c, t] as const)));
export const NICHE_PRESETS: NichePreset[] = CATALOG?.niche_presets.presets ?? [];
export const NICHE_PRESET_BY_ID = new Map(NICHE_PRESETS.map((p) => [p.id, p]));
export const CATEGORIES: { id: CategoryId; label: string }[] = CATALOG?.categories ?? [];
export const SESSION_CAPPED_BOOST = CATALOG?.session_capped_boost.points ?? 0;

/** The category (1 to 13) of a source type, or null for an unknown id. */
export function categoryOf(type: string): CategoryId | null {
  return SOURCE_TYPE_BY_ID.get(type)?.category ?? null;
}

/** Sensitive types (domestic violence and sexual assault agencies): no map pin, no street address. Unknown ids are not sensitive. */
export function isSensitive(type: string): boolean {
  return SOURCE_TYPE_BY_ID.get(type)?.sensitive ?? false;
}

export function isSessionCapped(type: string): boolean {
  return SOURCE_TYPE_BY_ID.get(type)?.session_capped ?? false;
}

/**
 * The source types a niche preset picks, best first: each type's default
 * points times its category weight and type boost (judgment, from the file).
 * Types the preset weights below neutral and doesn't list in `niches` are left out.
 */
export function typesForNiche(preset: string): { type: SourceType; weight: number; points: number }[] {
  const p = NICHE_PRESET_BY_ID.get(preset);
  if (!p) return [];
  return SOURCE_TYPES.map((type) => {
    const weight = (p.category_weights[String(type.category)] ?? 1) * (p.type_boosts[type.id] ?? 1);
    const raw = type.default_points * weight;
    // Clamped to the 0-35 scale the specialty factor uses; the raw product breaks ties.
    return { type, weight, points: Math.min(POINTS_MAX, Math.max(0, Math.round(raw * 10) / 10)), raw };
  })
    .filter(({ type, weight }) => type.niches.includes(p.id) || weight > 1)
    .sort((a, b) => b.points - a.points || b.raw - a.raw || a.type.label.localeCompare(b.type.label))
    .map(({ type, weight, points }) => ({ type, weight, points }));
}

/** The NPPES specialties (lib/referrals/nppes.ts) that find a source type; empty for non-NPPES types. */
export function specialtiesFor(type: string): SpecialtyId[] {
  return (SOURCE_TYPE_BY_ID.get(type)?.nppes_specialties ?? []).filter((s): s is SpecialtyId => SPECIALTY_BY_ID.has(s as SpecialtyId));
}

/** The type that owns an exact NUCC code, if any. */
export function typeForCode(code: string): SourceType | undefined {
  return TYPE_BY_CODE.get(code);
}

/** Who a specialty's kind sees, from the catalog (the type named like the specialty), or null. */
export function catalogSees(specialty: SpecialtyId): "all" | (typeof FOCUS_IDS)[number][] | null {
  return SOURCE_TYPE_BY_ID.get(specialty)?.sees ?? null;
}

/** True for a niche preset id that is in the catalog. */
export function isNichePreset(id: string): boolean {
  return NICHE_PRESET_BY_ID.has(id);
}

/** The catalog's default points for a specialty id (the source type with the same id), or null. */
export function catalogPoints(specialty: SpecialtyId): number | null {
  return SOURCE_TYPE_BY_ID.get(specialty)?.default_points ?? null;
}
