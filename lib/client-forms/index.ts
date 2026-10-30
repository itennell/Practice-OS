import { checkText, type CheckResult } from "./check";
import { emergencyContact, insuranceInfo, intake } from "./forms/business";
import { couplesFamilyConsent, informedConsent, minorConsent, telehealthConsent } from "./forms/consent";
import { accessibilityNotice, cardAuthorization, communicationConsent, npp, nppAck, recordsRequest } from "./forms/federal";
import { practicePolicies, slidingScale, terminationLetter } from "./forms/policies";
import { gad7, phq9 } from "./forms/screeners";
import { blocksFor, plainText, renderForm, type Overrides } from "./render";
import type { FormDef, FormId, PracticeFacts } from "./types";

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

/** The template with her edits, its text, and the required-elements check on that text. */
export function prepare(def: FormDef, facts: PracticeFacts, overrides: Overrides = {}): { text: string; check: CheckResult } {
  const text = plainText(def, facts, blocksFor(def, facts, overrides));
  return { text, check: checkText(def, text) };
}

export { renderForm, type Overrides };
