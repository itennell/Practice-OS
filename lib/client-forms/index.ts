import { checkText, type CheckResult } from "./check";
import { isIllinois } from "./facts";
import { emergencyContact, insuranceInfo, intake } from "./forms/business";
import { couplesFamilyConsent, informedConsent, minorConsent, telehealthConsent } from "./forms/consent";
import { accessibilityNotice, cardAuthorization, communicationConsent, npp, nppAck, recordsRequest } from "./forms/federal";
import { practicePolicies, slidingScale, terminationLetter } from "./forms/policies";
import { gad7, phq9 } from "./forms/screeners";
import { blocksFor, plainText, renderForm, type Overrides } from "./render";
import { FILL_IN, type Block, type FormDef, type FormId, type PracticeFacts } from "./types";

// The client forms library: one registry of every form type, in the order the
// library lists them. GFE, superbill and release of information have their own
// modules (lib/gfe, lib/superbill, lib/release) and are linked, not repeated.

const ALL: FormDef[] = [
  npp,
  nppAck,
  recordsRequest,
  minorConsent,
  accessibilityNotice,
  communicationConsent,
  informedConsent,
  practicePolicies,
  telehealthConsent,
  couplesFamilyConsent,
  terminationLetter,
  intake,
  emergencyContact,
  insuranceInfo,
  cardAuthorization,
  slidingScale,
  phq9,
  gad7,
];

export const FORMS: Partial<Record<FormId, FormDef>> = Object.fromEntries(ALL.map((f) => [f.id, f]));
export const formList = (): FormDef[] => ALL;
export const getForm = (id: FormId): FormDef | undefined => FORMS[id];

export const STATE_MESSAGE = "This template is written for Illinois; your state's rules haven't been researched yet.";
export const POLICIES_MESSAGE =
  "Save your practice policies once (Admin › Client forms › Your policies) before you download a form. Until then Aeon assumes nothing about your practice.";

/** Text that only holds under Illinois law. */
const ILLINOIS_TEXT = /Illinois|ILCS|\bIAC\b|DCFS|FOID/;

export type Prepared = {
  text: string;
  blocks: Block[];
  check: CheckResult;
  /** The gaps marked [fill in] that still print. */
  gaps: string[];
  /** True when the form is written on Illinois law and her practice is in another state. */
  wrongState: boolean;
  /** Plain reasons the form can't be downloaded yet; empty when it can. */
  blockers: string[];
};

/** The template with her edits, its text, the required-elements check on that text, and why it can't download yet. */
export function prepare(def: FormDef, facts: PracticeFacts, overrides: Overrides = {}): Prepared {
  const blocks = blocksFor(def, facts, overrides);
  const text = plainText(def, facts, blocks);
  const check = checkText(def, text);
  const gaps = [...new Set(text.match(/\[fill in[^\]]*\]/g) ?? [])];
  const wrongState = !isIllinois(facts) && ILLINOIS_TEXT.test(text);
  const blockers: string[] = [];
  if (wrongState) blockers.push(STATE_MESSAGE);
  if (!facts.policiesSaved) blockers.push(POLICIES_MESSAGE);
  if (gaps.length) blockers.push(`Fill in what's marked ${FILL_IN}] first: ${gaps.map((g) => g.slice(FILL_IN.length + 2, -1)).join("; ")}.`);
  if (check.missing.length) blockers.push(`Something the form must say is missing: ${check.missing.map((m) => `${m.label} (${m.citation})`).join("; ")}.`);
  if (!check.disclaimer) blockers.push("The attorney-review line is missing.");
  return { text, blocks, check, gaps, wrongState, blockers };
}

/** Every open question for her attorney on this form: the form's own list plus each clause marked for review. */
export function reviewItems(def: FormDef, facts: PracticeFacts): string[] {
  const fromClauses = def.build(facts).flatMap((b) => (b.kind === "clause" && b.review ? [b.review] : []));
  return [...new Set([...(def.review ?? []), ...fromClauses])];
}

export { renderForm, type Overrides };
