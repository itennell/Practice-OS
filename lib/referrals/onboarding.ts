// The Referrals questions in onboarding chapter 6 ("Connect your tools"). The
// shape is lib/onboarding/helper-questions.ts (HelperBlock, onboarding session).
// Her office ZIP is already asked in chapter 1, so the ZIP question only shows
// for a telehealth-only practice with no office.
import type { HelperBlock, HelperQuestion, PracticeBasics } from "../onboarding/helper-questions";
import { SPECIALTIES } from "./nppes";
import { DEFAULT_SPECIALTIES, getReferralSettings, saveReferralSettings } from "./settings";

export const referralsQuestions: HelperBlock = {
  helper: "referrals",
  questions: [
    // appliesWhen is a function, so it is kept non-enumerable: the onboarding page
    // hands each question to a client component, and React can't pass functions there.
    Object.defineProperty(
      {
        id: "home_zip",
        kind: "zip" as const,
        ask: "What ZIP code should Aeon search around for doctors who could send you clients?",
        help: "Use the ZIP where most of your clients live.",
      },
      "appliesWhen",
      { value: (b: PracticeBasics) => !b.officeZip, enumerable: false },
    ) as HelperQuestion,
    {
      id: "specialties",
      kind: "choices" as const,
      multi: true,
      ask: "Who would you like to hear from?",
      help: "Aeon looks for these near you in the free federal NPI Registry. You can change this later.",
      options: SPECIALTIES.map((s) => ({ value: s.id, label: s.id === "therapists" ? "Other therapists" : s.label })),
    },
  ],
  async load(basics) {
    const saved = await getReferralSettings();
    return {
      home_zip: saved.homeZip ?? basics.officeZip ?? "",
      specialties: saved.specialties.length ? saved.specialties : DEFAULT_SPECIALTIES,
    };
  },
  async save(answers) {
    const zip = answers.home_zip;
    const specialties = answers.specialties;
    if (zip !== undefined && typeof zip !== "string") throw new Error("Type your 5-digit ZIP code.");
    if (specialties !== undefined && (!Array.isArray(specialties) || specialties.some((s) => typeof s !== "string"))) {
      throw new Error("Pick from the list.");
    }
    await saveReferralSettings({ homeZip: zip as string | undefined, specialties: specialties as string[] | undefined });
  },
};
