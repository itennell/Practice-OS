// Her answers to the Psychology Today interview that aren't in MediaAnswers: the
// pick-lists that drive PT's search filters, and a few short facts only she knows.
// Saved in clinician_profile.onboarding_answers -> media -> pt. Pick values are PT's
// own wording (lib/media/schema.ts PT_LISTS) or a short label she typed herself.
import { z } from "zod";

export type PtAnswers = {
  availability: "accepting" | "waitlist" | "full" | null;
  sessionFormat: string[];
  paymentMethods: string[];
  slidingScale: boolean | null;
  education: string;
  extraCredentials: string;
  /** Exactly 3 once answered. */
  topSpecialties: string[];
  expertise: string[];
  ages: string[];
  participants: string[];
  communities: string[];
  faith: string[];
  therapyTypes: string[];
  /** Neighborhoods, nearby cities or ZIP codes clients come from. */
  nearby: string;
  /** Steps she answered or skipped, so the interview picks up where she left off. */
  seen: string[];
  skipped: string[];
};

export const EMPTY_PT: PtAnswers = {
  availability: null,
  sessionFormat: [],
  paymentMethods: [],
  slidingScale: null,
  education: "",
  extraCredentials: "",
  topSpecialties: [],
  expertise: [],
  ages: [],
  participants: [],
  communities: [],
  faith: [],
  therapyTypes: [],
  nearby: "",
  seen: [],
  skipped: [],
};

const label = z.string().trim().min(1).max(60);
const labels = (max: number) => z.array(label).max(max);
const text = (max: number) => z.string().trim().max(max, `Please keep this under ${max} characters.`);

export const ptSchema = z
  .object({
    availability: z.enum(["accepting", "waitlist", "full"]).nullable(),
    sessionFormat: labels(2),
    paymentMethods: labels(15),
    slidingScale: z.boolean().nullable(),
    education: text(160),
    extraCredentials: text(160),
    topSpecialties: labels(3),
    expertise: labels(25),
    ages: labels(6),
    participants: labels(4),
    communities: labels(10),
    faith: labels(5),
    therapyTypes: labels(15),
    nearby: text(200),
    seen: z.array(z.string().max(40)).max(60),
    skipped: z.array(z.string().max(40)).max(60),
  })
  .strict();

export function parsePt(raw: unknown): PtAnswers {
  const r = ptSchema.partial().safeParse(raw ?? {});
  return { ...EMPTY_PT, ...(r.success ? r.data : {}) } as PtAnswers;
}
