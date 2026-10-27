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
