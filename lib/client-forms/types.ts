import { z } from "zod";

// The client forms library (Admin › Client forms). Every form is a template: her
// practice facts filled in, blank boxes for the client. Nothing a client writes
// ever comes back to Practice-OS (no PHI before a BAA). Each form lists the
// elements the law or her profession's ethics code requires, with the source
// (docs/research.md › Client forms); check.ts proves each one is on the page.

export const FORM_IDS = [
  "npp",
  "npp_ack",
  "informed_consent",
  "telehealth_consent",
  "practice_policies",
  "communication_consent",
  "card_authorization",
  "records_request",
  "intake",
  "emergency_contact",
  "minor_consent",
  "couples_family_consent",
  "termination_letter",
  "sliding_scale",
  "insurance_info",
  "accessibility_notice",
  "phq9",
  "gad7",
] as const;
export type FormId = (typeof FORM_IDS)[number];
export const isFormId = (v: unknown): v is FormId => typeof v === "string" && (FORM_IDS as readonly string[]).includes(v);

/** Required by law, by her profession's ethics code, or good practice; screeners are optional copies. */
export type FormGroup = "law" | "ethics" | "practice" | "screener";
export const GROUP_LABEL: Record<FormGroup, string> = {
  law: "Required by law",
  ethics: "Required by your ethics code",
  practice: "Good practice",
  screener: "Screeners (blank copies)",
};

/** What the template knows about her practice. Never anything about a client. */
export type PracticeFacts = {
  practiceName: string;
  therapist: string;
  credential: string;
  /** e.g. "Licensed Clinical Professional Counselor (LCPC)". */
  licenseType: string;
  board: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  telehealth: boolean;
  fees: { code: string; label: string; cents: number }[];
  policies: Policies;
  /** False until she has saved her practice policies once; until then nothing downloads. */
  policiesSaved: boolean;
  isSample: boolean;
  /** Date the template was made, YYYY-MM-DD. */
  today: string;
};

/** A real calendar date, YYYY-MM-DD (2026-02-30 is refused). */
export function isCalendarDate(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Her practice policies, set once on the library and used by every form. Null means she hasn't said yet. */
export const policiesSchema = z
  .object({
    cancel_hours: z.number().int().min(0).max(168),
    late_cancel_fee_cents: z.number().int().min(0).max(100_000),
    no_show_fee_cents: z.number().int().min(0).max(100_000),
    reply_within_hours: z.number().int().min(1).max(168).nullable(),
    returned_payment_fee_cents: z.number().int().min(0).max(10_000),
    records_fee_note: z.string().trim().max(240),
    privacy_officer: z.string().trim().max(120),
    /** The colleague who contacts clients if she can't (her professional will). */
    backup_colleague: z.string().trim().max(160),
    accepts_insurance: z.boolean().nullable(),
    offers_sliding_scale: z.boolean(),
    texting_ok: z.boolean().nullable(),
    npp_effective_on: z.string().refine(isCalendarDate, "Use a real date (YYYY-MM-DD).").nullable(),
  })
  .strict();
export type Policies = z.infer<typeof policiesSchema>;

/** Marks a gap she has to fill. A form that still prints one can't be downloaded. */
export const FILL_IN = "[fill in";
export const fillIn = (what: string) => `${FILL_IN}: ${what}]`;

// Nothing about her practice is assumed: what she hasn't set prints as [fill in],
// and no form downloads until she has saved her policies once (lib/client-forms/index.ts).
export const DEFAULT_POLICIES: Policies = {
  cancel_hours: 24,
  late_cancel_fee_cents: 0,
  no_show_fee_cents: 0,
  reply_within_hours: null,
  returned_payment_fee_cents: 0,
  records_fee_note: "",
  privacy_officer: "",
  backup_colleague: "",
  accepts_insurance: null,
  offers_sliding_scale: false,
  texting_ok: null,
  npp_effective_on: null,
};

/** One required element, from the research matrix. `mustSay` is the plain-code proof: every pattern must match the form's text. */
export type RequiredElement = {
  id: string;
  /** Plain words, shown on the screen. */
  label: string;
  /** e.g. "45 CFR 164.520(b)(1)(v)". */
  citation: string;
  url: string;
  level: "law" | "ethics" | "practice";
  mustSay: RegExp[];
};

/** A block of the form. Clauses are text; fields are blank boxes for the client; signatures are hand-signed lines. */
export type Block =
  | { kind: "heading"; text: string }
  /** `label` names the clause in the editor; `review` marks wording her attorney must check (on screen only, never printed). */
  | { kind: "clause"; id: string; text: string; editable?: boolean; small?: boolean; label?: string; review?: string }
  | { kind: "field"; id: string; label: string; lines?: number }
  | { kind: "check"; id: string; label: string }
  | { kind: "signature"; caption: string }
  | { kind: "practice"; label: string; value: string }
  /** One question with a row of tick boxes (screeners). */
  | { kind: "scale"; id: string; item: string; options: string[] };

export type FormDef = {
  id: FormId;
  title: string;
  /** One line under the title in the library. */
  summary: string;
  group: FormGroup;
  /** Who needs it: license types, state, payers. */
  appliesTo: string;
  /** Words a chat request might use, for create_document and find_documents. */
  topics: string[];
  elements: RequiredElement[];
  build: (f: PracticeFacts) => Block[];
  /** Notes for her that never print (e.g. "post this in your waiting room"). */
  note?: string;
  /** Open questions the research could not settle. Shown as "Needs your attorney's review", never as settled. */
  review?: string[];
};

/** Printed at the bottom of every template, and checked. */
export const ATTORNEY_LINE =
  "This is a template from Practice-OS, not legal advice. Have your own attorney review it before you use it with clients.";
export const ATTORNEY_PATTERN = /not legal advice\. Have your own attorney review it/;
