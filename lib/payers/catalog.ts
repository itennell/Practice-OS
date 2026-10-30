import { z } from "zod";
import { CREDENTIALS, type Credential } from "../compliance/types";
import il from "../../data/payers/il.json";
import national from "../../data/payers/national.json";
import prereqData from "../../data/payers/prerequisites.json";

// The payer catalog: every insurer and insurance platform a solo therapist can
// apply to, with the steps to get credentialed and then contracted. Each fact
// carries its official source, a short quote and the day it was checked, and
// says whether that quote was read on the page itself (verified) or not.
// Illinois ships first; another state adds data/payers/<st>.json.

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const sourceSchema = z
  .object({
    url: z.string().url().startsWith("https://"),
    quote: z.string().trim().max(400),
    checked_on: isoDate,
    verified: z.boolean(),
  })
  .strict()
  .refine((s) => !s.verified || s.quote.length > 0, { message: "A verified source needs the quote that was read on the page." });
export type Source = z.infer<typeof sourceSchema>;

const sourced = <T extends z.ZodRawShape>(shape: T) => z.object({ ...shape, source: sourceSchema }).strict();

/**
 * How sure the eligibility call is. "stated": the source names her license (or
 * every license like it). "inferred": the page names no license types, so Aeon
 * read eligibility from what it does say. "check": the page leaves real doubt;
 * she should ask the payer before she starts. Left out: stated when the source
 * is verified, inferred when it isn't.
 */
export const ELIGIBILITY_BASIS = ["stated", "inferred", "check"] as const;
export type EligibilityBasis = (typeof ELIGIBILITY_BASIS)[number];
const eligibilitySchema = sourced({ eligible: z.boolean(), note: z.string().trim().max(600), basis: z.enum(ELIGIBILITY_BASIS).optional() });

/** A note about a payer. source is null when the note is Aeon's own research summary with no one page behind it. */
export const noteSchema = z.object({ text: z.string().trim().min(3).max(600), source: sourceSchema.nullable() }).strict();
export type PayerNote = z.infer<typeof noteSchema>;

export const PAYER_KINDS = ["medicare", "medicaid", "mco", "commercial", "military", "platform"] as const;
export const STAGES = ["credentialing", "contracting"] as const;
export type Stage = (typeof STAGES)[number];
export const AEON_CAN = ["caqh_prep", "cms855i", "none"] as const;

export const stepSchema = sourced({
  id: z.string().regex(/^[a-z0-9-]+$/),
  stage: z.enum(STAGES),
  title: z.string().trim().min(3).max(120),
  how: z.string().trim().min(10).max(900),
  portal_url: z.string().url().startsWith("https://").nullable(),
  aeon_can: z.enum(AEON_CAN),
  /** The step where she sends the application herself. Exactly one per payer. */
  submits: z.boolean(),
  /** Only for these licenses (left out: every license). */
  licenses: z.array(z.enum(CREDENTIALS)).min(1).optional(),
  /** Wording for one license where her path differs (e.g. her Medicare specialty). */
  how_by_license: z.object(Object.fromEntries(CREDENTIALS.map((c) => [c, z.string().trim().min(10).max(900).optional()])) as unknown as Record<Credential, z.ZodOptional<z.ZodString>>).strict().optional(),
});
export type PayerStep = z.infer<typeof stepSchema>;

export const payerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string().trim().min(2).max(120),
    /** Other names she might use ("Blue Cross", "UHC"). Matched exactly, never loosely. */
    aliases: z.array(z.string().trim().min(2).max(80)).optional(),
    kind: z.enum(PAYER_KINDS),
    /** Two-letter states it credentials in, or "*" for every state. */
    states: z.array(z.string().regex(/^([A-Z]{2}|\*)$/)).min(1),
    networks: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z0-9-]+$/),
            name: z.string().trim().min(2).max(120),
            panel: sourced({ status: z.enum(["open", "closed", "limited", "unknown"]), note: z.string().trim().max(600) }),
          })
          .strict(),
      )
      .min(1),
    eligibility: z.object(Object.fromEntries(CREDENTIALS.map((c) => [c, eligibilitySchema])) as Record<Credential, typeof eligibilitySchema>).strict(),
    requirements: sourced({
      caqh: z.boolean().nullable(),
      npi: z.string().trim().max(120),
      ein: z.string().trim().max(300),
      malpractice: z.string().trim().max(300),
      other: z.array(z.string().trim().max(400)),
    }),
    timeline: sourced({ text: z.string().trim().max(300) }),
    fees: sourced({ text: z.string().trim().max(300) }),
    recredential: sourced({ text: z.string().trim().max(300), months: z.number().int().positive().nullable() }),
    steps: z.array(stepSchema).min(2),
    notes: z.array(noteSchema),
  })
  .strict()
  .superRefine((p, ctx) => {
    const ids = new Set<string>();
    for (const s of p.steps) {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", message: `${p.id}: step ${s.id} twice` });
      ids.add(s.id);
    }
    for (const c of CREDENTIALS) {
      const mine = p.steps.filter((s) => !s.licenses || s.licenses.includes(c));
      if (p.eligibility[c].eligible && mine.filter((s) => s.submits).length !== 1) ctx.addIssue({ code: "custom", message: `${p.id}: ${c} needs exactly one submit step` });
    }
    if (p.kind !== "platform" && !p.steps.some((s) => s.stage === "contracting")) {
      ctx.addIssue({ code: "custom", message: `${p.id}: no contracting steps` });
    }
  });
export type Payer = z.infer<typeof payerSchema>;

export const prerequisiteSchema = sourced({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(3).max(120),
  how: z.string().trim().min(10).max(900),
  portal_url: z.string().url().startsWith("https://").nullable(),
  aeon_can: z.enum(AEON_CAN),
  /** "pllc" only when she bills as a PLLC or group. */
  applies: z.enum(["all", "pllc"]),
});
export type Prerequisite = z.infer<typeof prerequisiteSchema>;

const taxonomySchema = sourced({ code: z.string().regex(/^[0-9A-Z]{9}X$/), label: z.string().trim().max(120), note: z.string().trim().max(600).optional() });

const prereqFileSchema = z
  .object({
    prerequisites: z.array(prerequisiteSchema).min(1),
    taxonomy: z.object(Object.fromEntries(CREDENTIALS.map((c) => [c, taxonomySchema])) as unknown as Record<Credential, typeof taxonomySchema>).strict(),
    state_licenses: z.array(
      sourced({ state: z.string().regex(/^[A-Z]{2}$/), license: z.string().trim().max(20), independent_billing: z.boolean(), note: z.string().trim().max(600) }),
    ),
  })
  .strict();

/** Payers with verified data, keyed by state. National payers ("*") are in every state. */
const STATE_FILES: Record<string, unknown[]> = { IL: il };

let cache: { payers: Payer[]; prereqs: z.infer<typeof prereqFileSchema> } | null = null;

function load() {
  if (!cache) {
    const payers = [...(national as unknown[]), ...Object.values(STATE_FILES).flat()].map((p) => payerSchema.parse(p));
    const seen = new Set<string>();
    for (const p of payers) {
      if (seen.has(p.id)) throw new Error(`Payer ${p.id} is in the catalog twice`);
      seen.add(p.id);
    }
    cache = { payers, prereqs: prereqFileSchema.parse(prereqData) };
  }
  return cache;
}

export const allPayers = (): Payer[] => load().payers;
export const prerequisites = (): Prerequisite[] => load().prereqs.prerequisites;
export const stateLicenses = () => load().prereqs.state_licenses;
export const taxonomyFor = (c: Credential) => load().prereqs.taxonomy[c];
export const statesWithData = (): string[] => Object.keys(STATE_FILES);
/** Her steps for this payer: only the ones for her license, worded for it. */
export function stepsFor(p: Payer, license: Credential): PayerStep[] {
  return p.steps.filter((s) => !s.licenses || s.licenses.includes(license)).map((s) => ({ ...s, how: s.how_by_license?.[license] ?? s.how }));
}

export const payerById = (id: string): Payer | undefined => load().payers.find((p) => p.id === id);

/** Lowercase words only: "Blue Cross & Blue Shield (BCBSIL)" -> "blue cross blue shield bcbsil". */
export const normalizeName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every name a payer answers to, normalized: its id, its name, the name without its (parenthetical), and its aliases. */
export function namesOf(p: Payer): string[] {
  const out = new Set<string>();
  for (const n of [p.id, p.name, p.name.replace(/\s*\([^)]*\)\s*/g, " "), ...(p.aliases ?? [])]) {
    const k = normalizeName(n);
    if (k) out.add(k);
  }
  return [...out];
}

/** The catalog id for a payer name she typed, only on an exact name or alias match that points at one payer. */
export function catalogIdFor(name: string, form?: string | null): string | null {
  if (form === "cms855i") return "medicare";
  const q = normalizeName(name);
  if (!q) return null;
  const hits = load().payers.filter((p) => namesOf(p).includes(q));
  return hits.length === 1 ? hits[0]!.id : null;
}

/** What she sees next to any fact whose quote wasn't read on its source page. */
export const PLEASE_CONFIRM = "Please confirm";

/** One fact with its verified flag and source, the same shape for the Insurance tab and the chat. Pure. */
export function factView(text: string, source: Source | null) {
  const verified = Boolean(source?.verified);
  return { text, verified, source: source?.url ?? null, checked_on: source?.checked_on ?? null, ...(verified ? {} : { say: PLEASE_CONFIRM }) };
}
export type FactView = ReturnType<typeof factView>;
