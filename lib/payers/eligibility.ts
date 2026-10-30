import { CREDENTIALS, type Credential } from "../compliance/types";
import { allPayers, stateLicenses, statesWithData, type EligibilityBasis, type Payer, type Source } from "./catalog";

// Which payers fit her: plain code over the catalog, keyed on her license and
// state. Medicare, Aetna and Blue Cross come first whenever she qualifies.

/** Shown first and always prelisted when she is eligible. */
export const DEFAULT_PAYERS = ["medicare", "aetna", "bcbsil"] as const;

const KIND_ORDER: Record<Payer["kind"], number> = { medicare: 0, commercial: 1, medicaid: 2, mco: 3, military: 4, platform: 5 };

export type PayerFit = {
  payer: Payer;
  note: string;
  isDefault: boolean;
  /** How sure "she can join" is; see ELIGIBILITY_BASIS. */
  basis: EligibilityBasis;
  source: Source;
};

/** The word she sees next to "you can join": nothing when the source says so, else "Please confirm" or "Check eligibility". Pure. */
export function eligibilityTag(f: Pick<PayerFit, "basis">): "Please confirm" | "Check eligibility" | null {
  return f.basis === "check" ? "Check eligibility" : f.basis === "inferred" ? "Please confirm" : null;
}
export type PayerSet = {
  license: string;
  state: string;
  /** Insurers she can apply to directly. */
  payers: PayerFit[];
  /** Platforms that credential her for her (an alternative path). */
  platforms: PayerFit[];
  /** Payers in her state she can't join with this license, and why. */
  notEligible: { payer: Payer; reason: string }[];
  /** False when her state has no researched payer file yet: national payers only. */
  stateResearched: boolean;
  /** Set when her license can't bill insurance on its own. */
  blocked: string | null;
};

export const isCredential = (l: string): l is Credential => (CREDENTIALS as readonly string[]).includes(l);

const inState = (p: Payer, state: string) => p.states.includes("*") || p.states.includes(state);

export function payersFor(input: { license: string; state: string }): PayerSet {
  const state = input.state.trim().toUpperCase();
  const license = input.license.trim();
  const stateResearched = statesWithData().includes(state);
  const empty: PayerSet = { license, state, payers: [], platforms: [], notEligible: [], stateResearched, blocked: null };

  if (!isCredential(license)) {
    const rule = stateLicenses().find((r) => r.state === state && r.license.toUpperCase() === license.toUpperCase());
    return {
      ...empty,
      blocked:
        rule && !rule.independent_billing
          ? rule.note
          : `Insurers credential independently licensed clinicians (${CREDENTIALS.join(", ")}). Aeon doesn't have a payer path for ${license || "this license"}.`,
    };
  }

  const fits: PayerFit[] = [];
  const notEligible: PayerSet["notEligible"] = [];
  for (const payer of allPayers().filter((p) => inState(p, state))) {
    const e = payer.eligibility[license];
    const basis: EligibilityBasis = e.basis ?? (e.source.verified ? "stated" : "inferred");
    if (e.eligible) fits.push({ payer, note: e.note, isDefault: (DEFAULT_PAYERS as readonly string[]).includes(payer.id), basis, source: e.source });
    else notEligible.push({ payer, reason: e.note });
  }
  const rank = (f: PayerFit) => {
    const d = (DEFAULT_PAYERS as readonly string[]).indexOf(f.payer.id);
    return d >= 0 ? d : 10 + KIND_ORDER[f.payer.kind];
  };
  fits.sort((a, b) => rank(a) - rank(b) || a.payer.name.localeCompare(b.payer.name));
  return {
    ...empty,
    payers: fits.filter((f) => f.payer.kind !== "platform"),
    platforms: fits.filter((f) => f.payer.kind === "platform"),
    notEligible,
  };
}
