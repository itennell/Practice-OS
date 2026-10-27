// Fixed Good Faith Estimate text. Wording follows the CMS standard form
// (CMS-10791-2, a US government work); the "won't affect your care" and "not a
// contract" sentences are required by 45 CFR 149.610(c)(1)(x)-(xi) but missing
// from that form. Figures checked 2026-10-27: $400 (45 CFR 149.620(a)(2)(ii)),
// $25 fee and 120 days (cms.gov/medical-bill-rights/help/dispute-a-bill), help
// desk number (cms.gov/medical-bill-rights/help/guides/good-faith-estimate).

export const HHS_HELP_DESK = "1-800-985-3059";
export const DISPUTE_THRESHOLD = 400;
export const DISPUTE_FEE = 25;
export const DISPUTE_DAYS = 120;

export type Disclaimer = { id: string; cite: string; heading?: string; paragraphs: string[] };

/** (c)(1)(vi): goes directly above the list of separately scheduled items. */
export function separateSchedulingDisclaimer(howToRequest: string): Disclaimer {
  return {
    id: "separate_scheduling",
    cite: "45 CFR 149.610(c)(1)(vi)",
    paragraphs: [
      "The items or services listed below are expected to need separate scheduling. You will get a separate Good Faith Estimate for each one when you schedule it or ask for one.",
      "Diagnosis codes, service codes, expected charges and provider details for these items are not included here. They will be in those separate Good Faith Estimates.",
      `To get a Good Faith Estimate for any of them, ${howToRequest}`,
    ],
  };
}

export const DISCLAIMERS: Disclaimer[] = [
  {
    id: "estimate_only",
    cite: "45 CFR 149.610(c)(1)(ix)",
    heading: "Disclaimer",
    paragraphs: [
      "This Good Faith Estimate shows the costs of items and services that are reasonably expected for your health care needs for an item or service. The estimate is based on information known at the time the estimate was created.",
      "The Good Faith Estimate does not include any unknown or unexpected costs that may arise during treatment. Actual items, services or charges may differ from this estimate. You could be charged more if complications or special circumstances occur. If this happens, federal law allows you to dispute (appeal) the bill.",
    ],
  },
  {
    id: "more_services",
    cite: "45 CFR 149.610(c)(1)(viii)",
    paragraphs: [
      "There may be other items or services your provider recommends as part of your care that must be scheduled or requested separately. They are not included in this Good Faith Estimate.",
    ],
  },
  {
    id: "dispute",
    cite: "45 CFR 149.610(c)(1)(x); 149.620",
    heading: "If you are billed for more than this Good Faith Estimate, you have the right to dispute the bill.",
    paragraphs: [
      "You may contact the health care provider or facility listed to let them know the billed charges are higher than the Good Faith Estimate. You can ask them to update the bill to match the Good Faith Estimate, ask to negotiate the bill, or ask if there is financial assistance available.",
      `You may also start a dispute resolution process with the U.S. Department of Health and Human Services (HHS) if you are billed at least $${DISPUTE_THRESHOLD} more than this Good Faith Estimate. If you choose to use the dispute resolution process, you must start it within ${DISPUTE_DAYS} calendar days (about 4 months) of the date on the original bill.`,
      `There is a $${DISPUTE_FEE} fee to use the dispute process. If the agency reviewing your dispute agrees with you, you will have to pay the price on this Good Faith Estimate. If the agency disagrees with you and agrees with the health care provider or facility, you will have to pay the higher amount.`,
      "Starting a dispute will not affect the quality of the health care you receive from your provider.",
      `To learn more and get a form to start the process, go to www.cms.gov/nosurprises or call ${HHS_HELP_DESK}.`,
      `For questions or more information about your right to a Good Faith Estimate or the dispute process, visit www.cms.gov/nosurprises or call ${HHS_HELP_DESK}.`,
    ],
  },
  {
    id: "not_contract",
    cite: "45 CFR 149.610(c)(1)(xi)",
    paragraphs: [
      "This Good Faith Estimate is not a contract. It does not require you to get any items or services from the providers listed in it.",
    ],
  },
  {
    id: "keep_copy",
    cite: "CMS-10791-2",
    paragraphs: ["Keep a copy of this Good Faith Estimate in a safe place or take pictures of it. You may need it if you are billed a higher amount."],
  },
];
