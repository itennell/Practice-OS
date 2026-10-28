// The fixed lists a superbill line may use (docs/research.md > Superbill fields).
// Nothing on a superbill is free text, so nothing can carry a client's details.
// Labels are our own plain words, never AMA descriptor text.

export const CPT = {
  "90791": { label: "First session (diagnostic evaluation)", minutes: null },
  "90832": { label: "Therapy, 30 minutes", minutes: [16, 37] },
  "90834": { label: "Therapy, 45 minutes", minutes: [38, 52] },
  "90837": { label: "Therapy, 60 minutes", minutes: [53, null] },
  "90839": { label: "Crisis care, first 60 minutes", minutes: null },
  "90840": { label: "Crisis care, each added 30 minutes", minutes: null },
  "90846": { label: "Family therapy without the client", minutes: null },
  "90847": { label: "Family or couples therapy with the client", minutes: null },
  "90853": { label: "Group therapy", minutes: null },
} as const satisfies Record<string, { label: string; minutes: readonly [number, number | null] | null }>;
export type CptCode = keyof typeof CPT;
export const CPT_CODES = Object.keys(CPT) as [CptCode, ...CptCode[]];

/** Only the 90840 add-on can be billed more than once per line. */
export const MULTI_UNIT: readonly CptCode[] = ["90840"];

export const MODIFIERS = {
  "95": "Telehealth (video)",
  "93": "Telehealth (audio only)",
  GT: "Telehealth (older modifier some payers still ask for)",
} as const;
export type Modifier = keyof typeof MODIFIERS;
export const MODIFIER_CODES = Object.keys(MODIFIERS) as [Modifier, ...Modifier[]];

/** CMS Place of Service codes, quoted from the CMS code set. */
export const POS = {
  "02": "Telehealth provided other than in patient's home",
  "10": "Telehealth provided in patient's home",
  "11": "Office",
} as const;
export type PosCode = keyof typeof POS;
export const POS_CODES = Object.keys(POS) as [PosCode, ...PosCode[]];

export const DX_POINTERS = ["A", "B", "C", "D"] as const;
export type DxPointer = (typeof DX_POINTERS)[number];

/** The individual-therapy code for a session length (CPT time rule). */
export function cptForMinutes(minutes: number): CptCode {
  if (!Number.isFinite(minutes) || minutes < 16) throw new Error("Under 16 minutes can't be billed as a therapy session.");
  if (minutes <= 37) return "90832";
  if (minutes <= 52) return "90834";
  return "90837";
}
