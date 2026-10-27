import { addDays, type ISODate } from "./dates";
import type { Facts } from "./types";

// [Sample] facts for the fictional Dana Reyes, LCPC, Reyes Counseling PLLC,
// Lincoln Park, Chicago. Dates are relative to `today` so the demo always shows
// one red, one yellow and some green items.
export function danaFacts(today: ISODate): Facts {
  return {
    practice_state: "IL",
    city: "CHI",
    credential: "LCPC",
    first_renewal: false,
    sees_adults_26_plus: true,
    has_pllc: true,
    pllc_formed_on: "2025-12-10",
    entity_tax: "single_owner",
    employee_count: 0,
    has_contractors: false,
    bills_insurance_electronically: false,
    in_network_bcbsil: false,
    medicare: "none",
    medicare_revalidation_due_on: null,
    medicare_opt_out_ends_on: null,
    medicaid_enrolled: false,
    impact_revalidation_due_on: null,
    caqh_last_attested_on: addDays(today, -171),
    has_psypact_apit: false,
    apit_granted_on: null,
    qualified_examiner: false,
    uses_texting: true,
    ce_hours_done: 18,
    ce_topics_done: ["cultural_competency", "ethics"],
    is_sample: true,
  };
}
