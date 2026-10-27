import { z } from "zod";

// The shape of a compliance rule and of the practice facts that switch rules
// on. Rules are plain data (no functions) so the state-research skill can write
// them as JSON and lib/compliance/validate.ts can check them the same way it
// checks the rules we ship.

export const CREDENTIALS = ["LCSW", "LCPC", "LMFT", "Psychologist"] as const;
export type Credential = (typeof CREDENTIALS)[number];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const month = z.number().int().min(1).max(12);
const dayOfMonth = z.number().int().min(1).max(31);

export const factsSchema = z.object({
  practice_state: z.string().regex(/^[A-Z]{2}$/),
  /** City code for local rules, e.g. "CHI". */
  city: z.string().nullable(),
  credential: z.enum(CREDENTIALS),
  /** First renewal of her license in this state: no CE is due. */
  first_renewal: z.boolean(),
  /** Sees adults 26 or older (Illinois dementia training). */
  sees_adults_26_plus: z.boolean(),
  has_pllc: z.boolean(),
  pllc_formed_on: isoDate.nullable(),
  entity_tax: z.enum(["single_owner", "partnership", "s_corp"]).nullable(),
  employee_count: z.number().int().min(0),
  has_contractors: z.boolean(),
  /** Bills insurance electronically, which makes her a HIPAA covered entity. */
  bills_insurance_electronically: z.boolean(),
  in_network_bcbsil: z.boolean(),
  medicare: z.enum(["enrolled", "opted_out", "none"]),
  medicare_revalidation_due_on: isoDate.nullable(),
  medicare_opt_out_ends_on: isoDate.nullable(),
  medicaid_enrolled: z.boolean(),
  impact_revalidation_due_on: isoDate.nullable(),
  caqh_last_attested_on: isoDate.nullable(),
  /** Her current license expiration, for states that renew on her own date (birth month, issue date). */
  license_expires_on: isoDate.nullable(),
  has_psypact_apit: z.boolean(),
  apit_granted_on: isoDate.nullable(),
  /** Qualified examiner under 405 ILCS 5/1-122 (Illinois FOID reporting). */
  qualified_examiner: z.boolean(),
  uses_texting: z.boolean(),
  ce_hours_done: z.number().min(0),
  ce_topics_done: z.array(z.string()),
  is_sample: z.boolean(),
});
export type Facts = z.infer<typeof factsSchema>;

/** Facts a rule can test in `appliesTo.facts`. Dates are tested for "is set". */
export type FactKey = keyof Facts;

export const DATE_FACTS = [
  "pllc_formed_on",
  "medicare_revalidation_due_on",
  "medicare_opt_out_ends_on",
  "impact_revalidation_due_on",
  "caqh_last_attested_on",
  "apit_granted_on",
  "license_expires_on",
] as const satisfies readonly FactKey[];
export type DateFact = (typeof DATE_FACTS)[number];

const scalar = z.union([z.string(), z.boolean(), z.number(), z.null()]);

export const appliesToSchema = z
  .object({
    credentials: z.array(z.enum(CREDENTIALS)).min(1).optional(),
    /** Every listed fact matches: fact = value, or fact in [values]. */
    facts: z.record(z.union([scalar, z.array(scalar)])).optional(),
    /** At least one listed fact matches (FOID: credential Psychologist, or a qualified examiner). */
    any_facts: z.record(z.union([scalar, z.array(scalar)])).optional(),
    min_employees: z.number().int().min(1).optional(),
  })
  .strict();

const annualDate = z.object({ month, day: dayOfMonth, label: z.string().min(1) }).strict();

export const scheduleSchema = z.discriminatedUnion("type", [
  /** Same date every n years, counting from anchor_year (licenses: n = 2). */
  z.object({ type: z.literal("every_n_years"), month, day: dayOfMonth, anchor_year: z.number().int(), n: z.number().int().min(1) }).strict(),
  /** Fixed dates each year. `label` may use {Y} (that year) and {Y-1} (the year before). */
  z.object({ type: z.literal("annual"), dates: z.array(annualDate).min(1) }).strict(),
  /** One date only (the Medicare telehealth in-person rule starts Jan 1 2028). */
  z.object({ type: z.literal("once"), date: isoDate }).strict(),
  /**
   * A date the clinician gave us, plus an offset (CAQH: last attested + 180 days).
   * repeat: roll forward by the offset until it is today or later (a yearly anniversary).
   */
  z
    .object({
      type: z.literal("after_fact"),
      fact: z.enum(DATE_FACTS),
      days: z.number().int().default(0),
      months: z.number().int().min(0).default(0),
      repeat: z.boolean().default(false),
      /** The fact itself is the first due date (her license expiration), then every offset after. */
      start_at_fact: z.boolean().default(false),
    })
    .strict(),
  /** Due before the first day of the anniversary month of a date fact (Illinois LLC annual report). */
  z.object({ type: z.literal("before_anniversary_month"), fact: z.enum(DATE_FACTS) }).strict(),
  /** n days after Dec 31 (HIPAA small-breach log: 60). */
  z.object({ type: z.literal("days_after_year_end"), days: z.number().int().min(1) }).strict(),
  /** Starts when something happens; Aeon counts down from the event date. */
  z
    .object({
      type: z.literal("clock"),
      event: z.string().min(1),
      days: z.number().int().min(0).optional(),
      business_days: z.number().int().min(0).optional(),
      hours: z.number().int().min(0).optional(),
    })
    .strict(),
  /** "Did you set this up?" Asked again after reask_days (or at a date she gives). */
  z.object({ type: z.literal("setup"), reask_days: z.number().int().min(1) }).strict(),
  /** A note only: no date. */
  z.object({ type: z.literal("none") }).strict(),
]);
export type Schedule = z.infer<typeof scheduleSchema>;

export const ceTopicSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    label: z.string().min(1),
    hours: z.number().positive(),
    /** every_renewal; every_6_years; once (a one-time, lifetime course). */
    cadence: z.enum(["every_renewal", "every_6_years", "once"]),
    /** Only when this fact is true (dementia: sees_adults_26_plus). */
    only_if: z.enum(["sees_adults_26_plus"]).optional(),
    /** Listed by the board but not required by the rule: shown as optional. */
    optional_note: z.string().optional(),
  })
  .strict();

export type CeTopicInput = z.input<typeof ceTopicSchema>;

export const CATEGORIES = [
  "license_renewal",
  "license_window",
  "ce_hours",
  "caqh_reattestation",
  "medicare_revalidation",
  "medicaid_revalidation",
  "pllc_annual_report",
  "pllc_registration",
  "quarterly_taxes",
  "business_tax_return",
  "payroll",
  "contractors",
  "hipaa",
  "billing",
  "telehealth",
  "reporting_duty",
  "npi_update",
  "texting",
  "insurance",
  "business_setup",
  "other",
] as const;

export const ruleSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9_]+$/),
    kind: z.enum(["deadline", "clock", "setup", "note"]),
    /** "US" for federal, a state code ("IL"), or state-city ("IL-CHI"). */
    jurisdiction: z.string().regex(/^(US|[A-Z]{2}(-[A-Z]{2,4})?)$/),
    category: z.enum(CATEGORIES),
    title: z.string().min(1).max(120),
    applies_to: appliesToSchema.default({}),
    schedule: scheduleSchema,
    /** Days before due that turn the card red and yellow. */
    lead: z.object({ red: z.number().int().min(0), yellow: z.number().int().min(0) }).strict().default({ red: 14, yellow: 45 }),
    /** Move a weekend or legal-holiday due date to the next business day (federal returns). */
    roll_forward: z.boolean().default(false),
    what_to_do: z.string().min(1),
    /** The part only she can do (sign, attest, pay, submit). Null when Aeon can do it all. */
    you_must: z.string().nullable(),
    guide: z.string().regex(/^[a-z0-9-]+$/).nullable().default(null),
    ce: z.object({ hours: z.number().positive(), topics: z.array(ceTopicSchema) }).strict().optional(),
    source: z
      .object({
        citation: z.string().min(1),
        /** Required, except for setup reminders that rest on no rule (malpractice, lease). */
        url: z.string().url().optional(),
        /** A short line from the source page (under 15 words). Required for agent-researched rules. */
        quote: z.string().max(200).optional(),
        checked_on: isoDate,
        /** Agent-researched rules: cited (Muse quoted a cited official page) or page (our own fetch found the quote). */
        evidence: z.enum(["cited", "page"]).optional(),
      })
      .strict(),
    verified_by: z.enum(["maintainer", "agent", "clinician"]),
    /** A broader rule this one replaces where it applies (Illinois CAQH 180 days replaces the US 120). */
    replaces: z.string().regex(/^[a-z0-9_]+$/).optional(),
    /** Where sources disagree, or what is still unverified. Shown on the card. */
    caveat: z.string().optional(),
  })
  .strict()
  .refine((r) => r.source.url !== undefined || r.kind === "setup", { message: "Every rule except a setup reminder needs a source URL." })
  .refine((r) => r.ce === undefined || r.category === "ce_hours", { message: "Only ce_hours rules carry CE topics." })
  .refine((r) => (r.kind === "clock") === (r.schedule.type === "clock"), { message: "Clock rules use a clock schedule." })
  .refine((r) => (r.kind === "setup") === (r.schedule.type === "setup"), { message: "Setup rules use a setup schedule." })
  .refine((r) => (r.kind === "note") === (r.schedule.type === "none"), { message: "Notes have no schedule." });

export type Rule = z.output<typeof ruleSchema>;
export type RuleInput = z.input<typeof ruleSchema>;
