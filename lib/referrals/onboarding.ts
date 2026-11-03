// The Referrals questions in onboarding chapter 6 ("Connect your tools"). The
// shape is lib/onboarding/helper-questions.ts (HelperBlock, onboarding session).
// Her office ZIP is already asked in chapter 1, so the ZIP question only shows
// for a telehealth-only practice with no office. Her niche comes before the
// kinds of provider: picking one pre-selects that niche's top kinds, which she
// can change on the next screen.
import type { HelperBlock, HelperQuestion, PracticeBasics } from "../onboarding/helper-questions";
import { SPECIALTIES } from "./nppes";
import { DEFAULT_SPECIALTIES, getReferralSettings, NICHE_OPTIONS, saveReferralSettings, specialtiesForNiche } from "./settings";

/** The niche screen's "none" answer: no niche weighting. */
export const NO_NICHE = "none";

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
      id: "niche",
      kind: "choices" as const,
      multi: false,
      ask: "Which of these is closest to your niche?",
      help: "Aeon ranks who could send you clients by it, and picks who to look for first. You can change this later in Settings.",
      says: "Your niche tells me who to reach out to first.",
      refreshes: ["specialties"],
      options: [...NICHE_OPTIONS, { value: NO_NICHE, label: "None of these, or not sure yet" }],
    },
    {
      id: "specialties",
      kind: "choices" as const,
      multi: true,
      ask: "Who would you like to hear from?",
      help: "Aeon looks for these near you in the free federal NPI Registry. Your niche picked some; change them if you like.",
      options: SPECIALTIES.map((s) => ({ value: s.id, label: s.id === "therapists" ? "Other therapists" : s.label })),
    },
  ],
  async load(basics) {
    const saved = await getReferralSettings();
    return {
      home_zip: saved.homeZip ?? basics.officeZip ?? "",
      ...(saved.nichePreset ? { niche: saved.nichePreset } : {}),
      specialties: saved.specialties.length ? saved.specialties : DEFAULT_SPECIALTIES,
    };
  },
  async save(answers) {
    const zip = answers.home_zip;
    const specialties = answers.specialties;
    const niche = answers.niche;
    if (zip !== undefined && typeof zip !== "string") throw new Error("Type your 5-digit ZIP code.");
    if (specialties !== undefined && (!Array.isArray(specialties) || specialties.some((s) => typeof s !== "string"))) {
      throw new Error("Pick from the list.");
    }
    if (niche !== undefined && typeof niche !== "string") throw new Error("Pick a niche from the list.");
    if (typeof niche === "string") {
      // Checked against the catalog in saveReferralSettings; a niche picks its top kinds (she can change them next).
      const preset = niche === NO_NICHE ? null : niche;
      const kinds = preset ? specialtiesForNiche(preset) : [];
      await saveReferralSettings({ nichePreset: preset, ...(kinds.length ? { specialties: kinds } : {}) });
      return;
    }
    await saveReferralSettings({ homeZip: zip as string | undefined, specialties: specialties as string[] | undefined });
  },
};
