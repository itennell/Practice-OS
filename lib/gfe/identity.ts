import { z } from "zod";

// The client details she types to make a Good Faith Estimate PDF. They are used
// for that one PDF and never stored, logged or audited (migration 006 has no
// column for them). Only lib/gfe/store.ts toGoodFaithEstimate() reads them.

export const clientIdentitySchema = z
  .object({
    firstName: z.string().trim().min(1).max(80),
    middleName: z.string().trim().max(80).optional(),
    lastName: z.string().trim().min(1).max(80),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date of birth as YYYY-MM-DD"),
    street: z.string().trim().min(1).max(120),
    apartment: z.string().trim().max(40).optional(),
    city: z.string().trim().min(1).max(80),
    state: z.string().trim().regex(/^[A-Z]{2}$/, "Two-letter state"),
    zip: z.string().trim().regex(/^\d{5}(-\d{4})?$/, "ZIP code"),
    phone: z.string().trim().max(30).default(""),
    email: z.string().trim().max(120).default(""),
    contactPreference: z.enum(["mail", "email"]),
    /** Optional ICD-10-CM code; blank prints "Not yet determined". */
    diagnosisCode: z
      .string()
      .trim()
      .regex(/^([A-TV-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?)?$/, "An ICD-10 code like F41.1, or leave it blank")
      .optional(),
  })
  .strict();

export type ClientIdentity = z.infer<typeof clientIdentitySchema>;
