import { addMonths } from "../compliance/dates";
import { DANA_PROFILE, SAMPLE_NPI, SAMPLE_TIN } from "../credentialing/demo";
import { gfeDueDate, type OpenDays } from "./timing";
import type { GoodFaithEstimate } from "./types";

// [Sample] Good Faith Estimate for a fictional self-pay client of the fictional
// Dana Reyes, LCPC. Fees are made up for the demo.

/** Dana's [Sample] hours: Monday to Thursday, closed federal holidays. */
export const DANA_OPEN_DAYS: OpenDays = { weekdays: [1, 2, 3, 4], closedOn: [], closeFederalHolidays: true };

export const SAMPLE_BOOKING = { scheduledOn: "2026-10-26", serviceOn: "2026-11-12" } as const;

const OFFICE = `${DANA_PROFILE.practiceLocation.address.street}, Chicago, IL 60614`;

export function sampleGfe(): GoodFaithEstimate {
  const issuedOn = SAMPLE_BOOKING.scheduledOn;
  const provider = {
    name: `${DANA_PROFILE.identity.name}, ${DANA_PROFILE.identity.credential} (fictional demo practice)`,
    type: "Licensed Clinical Professional Counselor (individual practitioner)",
    npi: SAMPLE_NPI,
    tin: SAMPLE_TIN,
    address: DANA_PROFILE.practiceLocation.address,
    contact: { person: DANA_PROFILE.identity.name, phone: DANA_PROFILE.identity.phone, email: DANA_PROFILE.identity.email },
  };
  return {
    issuedOn,
    convener: `${DANA_PROFILE.identity.practiceName} (fictional demo practice)`,
    patient: {
      firstName: "Jordan",
      lastName: "Example [Sample]",
      dob: "1990-01-01",
      address: { street: "100 Sample St", city: "Chicago", state: "IL", zip: "60657" },
      phone: "312-555-0100",
      email: "jordan@example.com",
      contactPreference: "email",
    },
    primaryService: {
      description: "Individual talk therapy: one first session (intake), then weekly 53-minute or longer sessions.",
      scheduledDates: [SAMPLE_BOOKING.serviceOn],
    },
    recurring: { frequency: "Once a week", totalVisits: 51, from: SAMPLE_BOOKING.serviceOn, through: addMonths(issuedOn, 12) },
    diagnosis: { primary: null, secondary: null },
    estimates: [
      {
        provider,
        lines: [
          {
            service: "First session: psychiatric diagnostic evaluation (intake)",
            location: OFFICE,
            diagnosisCode: null,
            serviceCode: { type: "CPT", number: "90791" },
            quantity: 1,
            unitCharge: 20_000,
          },
          {
            service: "Psychotherapy, 53 minutes or longer",
            location: `${OFFICE}, or telehealth from Illinois`,
            diagnosisCode: null,
            serviceCode: { type: "CPT", number: "90837" },
            quantity: 50,
            unitCharge: 17_500,
          },
        ],
        notes: "Self-pay rate [Sample]. Missed-session fees are not included.",
      },
    ],
    separatelyScheduled: [],
    howToRequest: `call ${DANA_PROFILE.identity.phone} or email ${DANA_PROFILE.identity.email}.`,
    isSample: true,
  };
}

export function sampleGfeDue() {
  return gfeDueDate({ kind: "scheduled", ...SAMPLE_BOOKING }, DANA_OPEN_DAYS);
}
