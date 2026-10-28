// How good a referral source looks, 0-100, in plain code so it can be read and
// tested. Only providers whose primary specialty is one we search for get here
// (lib/referrals/nppes.ts), so this ranks within a good list:
//   specialty   up to 40  family medicine sends the most people to a therapist
//   distance    up to 30  30 in the same ZIP center, 6 fewer per mile, 0 at 5 miles
//   a person    15        an individual clinician answers a letter; a big group rarely does
//   phone       10        a listed phone means a reachable office
//   up to date  5         NPPES record updated in the last two years
import type { Provider, SpecialtyId } from "./nppes";

export const SPECIALTY_POINTS: Record<SpecialtyId, number> = {
  family_medicine: 40,
  pediatrics: 36,
  ob_gyn: 36,
  internal_medicine: 34,
  oncology: 32,
  therapists: 28,
};

export function fitScore(p: Pick<Provider, "specialty" | "npiType" | "phone" | "lastUpdated">, miles: number | null, today = new Date()): number {
  const specialty = SPECIALTY_POINTS[p.specialty];
  const distance = miles === null ? 10 : Math.max(0, Math.round(30 - 6 * miles));
  const person = p.npiType === "individual" ? 15 : 0;
  const phone = p.phone ? 10 : 0;
  const updated = p.lastUpdated ? new Date(p.lastUpdated) : null;
  const twoYears = 2 * 365 * 24 * 3600 * 1000;
  const fresh = updated && !Number.isNaN(updated.getTime()) && today.getTime() - updated.getTime() < twoYears ? 5 : 0;
  return Math.min(100, specialty + distance + person + phone + fresh);
}
