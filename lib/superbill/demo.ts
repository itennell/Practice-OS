import type { SuperbillInput, SuperbillRow } from "./store";
import { priceSuperbill } from "./store";

// [Sample] superbill for a fictional client of the fictional Dana Reyes, LCPC:
// four 53-minute telehealth sessions from the client's home in October, at her
// [Sample] $175 rate, paid in full. No client details: the PDF leaves them blank.

export const SAMPLE_SUPERBILL_INPUT: SuperbillInput = {
  lines: ["2026-10-05", "2026-10-12", "2026-10-19", "2026-10-26"].map((date_of_service) => ({
    date_of_service,
    cpt: "90837",
    modifier: "95",
    pos: "10",
    cents: 17_500,
  })),
  paid_cents: 70_000,
};

export function sampleSuperbill(): SuperbillRow {
  const p = priceSuperbill(SAMPLE_SUPERBILL_INPUT, [], "2026-10-27");
  return {
    id: "00000000-0000-4000-8000-000000000010",
    reference: "SB-2026-0001",
    ...p,
    issued_on: null,
    created_by: "sample",
    is_sample: true,
    created_at: new Date("2026-10-27T15:00:00Z"),
  };
}
