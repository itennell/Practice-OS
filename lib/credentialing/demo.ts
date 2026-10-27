import type { CredentialingProfile } from "./profile";

// [Sample] credentialing profile for the fictional Dana Reyes, LCPC. Every value
// is fake: the NPI passes the check digit but returns no one in NPPES, the TIN
// starts with 00 (never issued by the IRS), and phone numbers use 555-01xx.

export const SAMPLE_NPI = "1999999901";
export const SAMPLE_TIN = "00-1234567";

export const DANA_PROFILE: CredentialingProfile = {
  identity: {
    name: "Dana Reyes",
    credential: "LCPC",
    practiceName: "Reyes Counseling PLLC",
    email: "dana@example.com",
    phone: "312-555-0142",
  },
  education: [{ degree: "MA, Clinical Mental Health Counseling", school: "Example University [Sample]", graduated: 2019 }],
  license: {
    type: "Licensed Clinical Professional Counselor (LCPC)",
    state: "IL",
    board: "Illinois Department of Financial and Professional Regulation (IDFPR)",
    numberStored: false,
  },
  npi: { number: SAMPLE_NPI, type: 1, taxonomy: "101YP2500X", taxonomyLabel: "Counselor, Professional" },
  malpractice: { carrier: "Example Mutual [Sample]", perClaim: 1_000_000, aggregate: 3_000_000, expiresOn: "2026-12-01" },
  practiceLocation: {
    name: "Reyes Counseling PLLC",
    address: { street: "2400 N Example Ave, Suite 2", city: "Chicago", state: "IL", zip: "60614" },
    phone: "312-555-0142",
    telehealth: true,
  },
  workHistory: [
    { employer: "Example Community Counseling Center [Sample]", role: "Staff counselor", from: "2019-08-01", to: "2025-11-30" },
    { employer: "Reyes Counseling PLLC", role: "Owner, LCPC", from: "2025-12-10", to: null },
  ],
  gapExplanations: [],
  documents: [
    { id: "license", label: "License verification", upload: "a current IDFPR license lookup", onFile: true, expiresOn: null },
    { id: "malpractice", label: "Malpractice face sheet", upload: "your renewed malpractice face sheet", onFile: true, expiresOn: "2026-12-01" },
    { id: "diploma", label: "Diploma or transcript", upload: "your diploma or final transcript", onFile: true, expiresOn: null },
    { id: "cv", label: "CV with month/year dates", upload: "a CV with month and year for every job", onFile: true, expiresOn: null },
    { id: "w9", label: "W-9 for the PLLC", upload: "a signed W-9 for the PLLC", onFile: false, expiresOn: null },
  ],
  isSample: true,
};
