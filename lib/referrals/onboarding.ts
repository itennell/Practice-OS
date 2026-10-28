// The Referrals questions in onboarding chapter 6 ("Connect your tools"). The
// shape is lib/onboarding/helper-questions.ts (HelperBlock, onboarding session).
// Her office ZIP is already asked in chapter 1, so the ZIP question only shows
// for a telehealth-only practice with no office.
import { SPECIALTIES } from "./nppes";
import { DEFAULT_SPECIALTIES, getReferralSettings, saveReferralSettings } from "./settings";

type Basics = { officeZip: string | null };

export const referralsQuestions = {
  helper: "referrals" as const,
  questions: [
    {
      id: "home_zip",
      kind: "zip" as const,
      ask: "What ZIP code should Aeon search around for doctors who could send you clients?",
      help: "Use the ZIP where most of your clients live.",
      appliesWhen: (b: Basics) => !b.officeZip,
    },
    {
      id: "specialties",
      kind: "choices" as const,
      multi: true,
      ask: "Who would you like to hear from?",
      help: "Aeon looks for these near you in the free federal NPI Registry. You can change this later.",
      options: SPECIALTIES.map((s) => ({ value: s.id, label: s.id === "therapists" ? "Other therapists" : s.label })),
    },
  ],
  async load(basics: Basics) {
    const saved = await getReferralSettings();
    return {
      home_zip: saved.homeZip ?? basics.officeZip ?? "",
      specialties: saved.specialties.length ? saved.specialties : DEFAULT_SPECIALTIES,
    };
  },
  async save(answers: Record<string, unknown>) {
    const zip = answers.home_zip;
    const specialties = answers.specialties;
    if (zip !== undefined && typeof zip !== "string") throw new Error("Type your 5-digit ZIP code.");
    if (specialties !== undefined && (!Array.isArray(specialties) || specialties.some((s) => typeof s !== "string"))) {
      throw new Error("Pick from the list.");
    }
    await saveReferralSettings({ homeZip: zip as string | undefined, specialties: specialties as string[] | undefined });
  },
};
