// The source catalog's 13 categories and which one each NPI Registry kind sits
// in, small enough for the browser (the area explorer groups its chips by these).
// The same as docs/research/referral-sources.json; tests/referrals-catalog.test.ts
// checks they match.
import type { SpecialtyId } from "./nppes";

export const CATEGORY_LABELS: Record<number, string> = {
  1: "Primary care",
  2: "Medical specialists",
  3: "Psychiatry and prescribers",
  4: "Mental health peers (two-way)",
  5: "Hospital and health system staff",
  6: "Aging and long-term care",
  7: "Schools and universities",
  8: "Workplace",
  9: "Legal and financial",
  10: "Faith and community",
  11: "Nonprofits and support organizations",
  12: "Life-transition and wellness businesses",
  13: "Special populations",
};

export const SPECIALTY_CATEGORY: Record<SpecialtyId, number> = {
  family_medicine: 1,
  internal_medicine: 1,
  ob_gyn: 1,
  pediatrics: 1,
  midwives: 1,
  nurse_practitioners_pas: 1,
  urgent_care: 1,
  oncology: 2,
  cardiology: 2,
  neurology: 2,
  gastroenterology: 2,
  endocrinology: 2,
  rheumatology: 2,
  pain_medicine: 2,
  sleep_medicine: 2,
  plastic_surgery: 2,
  dermatology: 2,
  genetic_counselors: 2,
  physiatry: 2,
  psychiatry: 3,
  addiction_medicine: 3,
  therapists: 4,
  mental_health_programs: 4,
  palliative_care: 5,
  hospice: 5,
  home_health: 6,
  lactation_consultants: 12,
  doulas: 12,
  rehab_therapists: 12,
  dietitians: 12,
  bodywork: 12,
  sports_medicine: 13,
};

/** The kinds grouped by category, in category order, each group in the order given. */
export function groupByCategory<T extends { id: SpecialtyId }>(items: T[]): { category: number; label: string; items: T[] }[] {
  const groups = new Map<number, T[]>();
  for (const it of items) {
    const c = SPECIALTY_CATEGORY[it.id];
    groups.set(c, [...(groups.get(c) ?? []), it]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([category, list]) => ({ category, label: CATEGORY_LABELS[category], items: list }));
}
