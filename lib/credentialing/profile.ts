import type { ISODate } from "../compliance/dates";

// The credentialing profile, in the order CAQH ProView asks for it. It never
// holds a license number: the clinician types that into CAQH herself.

export type Address = { street: string; city: string; state: string; zip: string };

export type CredentialingDocument = {
  id: string;
  label: string;
  /** What to upload when it's missing or expiring. */
  upload: string;
  onFile: boolean;
  expiresOn: ISODate | null;
};

export type WorkHistoryEntry = {
  employer: string;
  role: string;
  from: ISODate;
  /** Null means current. */
  to: ISODate | null;
};

export type GapExplanation = { from: ISODate; to: ISODate; reason: string };

export type NpiCheck = {
  checkedAt: string;
  found: boolean;
  name: string | null;
  taxonomy: string | null;
  /** Found, and the registry's taxonomy matches hers. */
  matches: boolean;
};

/** Common NUCC taxonomy codes for licensed therapists. */
export const TAXONOMY_LABEL: Record<string, string> = {
  "101YP2500X": "Counselor, Professional",
  "101YM0800X": "Counselor, Mental Health",
  "1041C0700X": "Social Worker, Clinical",
  "106H00000X": "Marriage & Family Therapist",
  "103TC0700X": "Psychologist, Clinical",
};

export type CredentialingProfile = {
  identity: {
    name: string;
    credential: string;
    practiceName: string;
    email: string;
    phone: string;
  };
  education: { degree: string; school: string; graduated: number }[];
  license: {
    type: string;
    state: string;
    board: string;
    /** Always false: Practice-OS doesn't store license numbers. */
    numberStored: false;
  };
  npi: { number: string; type: 1 | 2; taxonomy: string; taxonomyLabel: string };
  /** The practice's federal tax ID (EIN), 12-3456789. Null until she adds it. */
  tin: string | null;
  /** Last check of her NPI against the public NPPES registry. */
  npiCheck: NpiCheck | null;
  malpractice: { carrier: string; perClaim: number; aggregate: number; expiresOn: ISODate };
  practiceLocation: { name: string; address: Address; phone: string; telehealth: boolean };
  workHistory: WorkHistoryEntry[];
  gapExplanations: GapExplanation[];
  documents: CredentialingDocument[];
  isSample: boolean;
};

/** NPI check digit: Luhn over "80840" + the first 9 digits (CMS NPI standard). */
export function isValidNpi(npi: string): boolean {
  if (!/^[12]\d{9}$/.test(npi)) return false;
  const digits = `80840${npi}`.split("").reverse().map(Number);
  const sum = digits.reduce((s, d, i) => {
    if (i % 2 === 0) return s + d;
    const twice = d * 2;
    return s + (twice > 9 ? twice - 9 : twice);
  }, 0);
  return sum % 10 === 0;
}
