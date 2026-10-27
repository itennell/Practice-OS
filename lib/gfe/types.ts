import type { ISODate } from "../compliance/dates";
import type { Address } from "../credentialing/profile";

// A Good Faith Estimate for an uninsured or self-pay client. Each field maps to
// 45 CFR 149.610(c)(1) and the CMS standard form (CMS-10791-2).

export type GfePatient = {
  firstName: string;
  middleName?: string;
  lastName: string;
  dob: ISODate; // (c)(1)(i)
  address: Address & { apartment?: string };
  phone: string;
  email: string;
  contactPreference: "mail" | "email";
};

export type GfeProvider = {
  name: string;
  type: string;
  npi: string; // (c)(1)(v)
  tin: string; // (c)(1)(v)
  address: Address;
  contact: { person: string; phone: string; email: string };
};

export type GfeLine = {
  service: string;
  /** Where it's provided: an address or "Telehealth from Illinois". (c)(1)(v) */
  location: string;
  /** Null when not yet known; the PDF prints DIAGNOSIS_NOT_YET. (c)(1)(iv) */
  diagnosisCode: string | null;
  serviceCode: { type: "CPT" | "HCPCS"; number: string };
  quantity: number;
  /** Expected charge per unit, in cents (cash rate after any self-pay discount). */
  unitCharge: number;
};

export type GfeProviderEstimate = { provider: GfeProvider; lines: GfeLine[]; notes?: string };

export type GoodFaithEstimate = {
  issuedOn: ISODate;
  convener: string;
  patient: GfePatient;
  primaryService: {
    /** Plain language. (c)(1)(ii) */
    description: string;
    /** Scheduled date(s), or empty when not yet scheduled. */
    scheduledDates: ISODate[];
  };
  /** One estimate for recurring care, (b)(1)(x). Scope may not exceed 12 months. */
  recurring: { frequency: string; totalVisits: number; from: ISODate; through: ISODate } | null;
  diagnosis: { primary: string | null; secondary: string | null };
  /** Grouped by provider, (c)(1)(iii). */
  estimates: GfeProviderEstimate[];
  /** Items needing separate scheduling, (c)(1)(vi). */
  separatelyScheduled: string[];
  /** How to ask for a separate estimate. */
  howToRequest: string;
  isSample: boolean;
};

export const DIAGNOSIS_NOT_YET = "Not yet determined; set after the first session";
