// Each helper's own setup questions, asked in onboarding chapter 6 ("Connect your tools").
// Append-only: each helper session adds one import line and one entry to HELPER_QUESTIONS,
// in its own block. The onboarding shell shows one question per screen with Back, Skip and
// "Set up later", runs the crisis check and the client-detail guard on every "text" answer
// before save(), and never stores these answers itself.
import { instagramQuestions } from "../instagram/onboarding";
import { referralsQuestions } from "../referrals/onboarding";
import { frontDeskQuestions } from "../frontdesk/onboarding";

/** What onboarding already knows, so a block can skip or prefill a question. */
export type PracticeBasics = {
  state: string | null; // two letters, e.g. "IL"
  credential: "LCSW" | "LCPC" | "LMFT" | "Psychologist" | null;
  practiceStage: "beginning" | "middle" | "late" | null;
  officeZip: string | null; // from her office address (credentialing practice_location.zip)
  telehealth: boolean | null;
};

type Base = {
  id: string;
  ask: string; // plain words, about a 6th-grade level
  help?: string;
  /** Aeon's speech bubble on this screen; defaults to "This is for your … helper." */
  says?: string;
  /** Picking this answer puts the screen on "Still to set up", under these words. */
  later?: { when: string; ask: string };
  /**
   * Leave out when it doesn't apply. Defaults to always. `mine` holds this block's
   * answers so far (ids without the helper prefix), so a block can branch.
   */
  appliesWhen?: (basics: PracticeBasics, mine?: Record<string, unknown>) => boolean;
};

type Choice = { value: string; label: string };

export type HelperQuestion =
  | (Base & { kind: "zip" })
  | (Base & { kind: "text"; maxLength?: number })
  | (Base & { kind: "number"; min?: number; max?: number; unit?: string })
  | (Base & { kind: "yesno" })
  | (Base & {
      kind: "choices";
      multi: boolean;
      options: Choice[];
      /** For multi: the "none of these" option that clears the others. */
      exclusive?: string;
      /** A short will/won't note shown on the screen. */
      note?: { will: string; wont: string };
    })
  /** A choice that can show a Connect button (Settings › Connections card), with optional steps first. */
  | (Base & { kind: "connect"; provider: string; options: Choice[]; steps?: string[] })
  /** Three [Sample] captions to pick from, or a pasted post she likes: { pick, example }. */
  | (Base & { kind: "style" });

export type HelperBlock = {
  helper: "referrals" | "instagram" | "front_desk" | "admin";
  questions: HelperQuestion[];
  /** Slot these screens in after this question id; defaults to "uses_texting". */
  after?: string;
  /** Prefills from the helper's own storage (and may use basics, e.g. officeZip). */
  load(basics: PracticeBasics): Promise<Record<string, unknown>>;
  /** Saves to the helper's own storage. Throws an Error with a plain-words message on bad input. */
  save(answers: Record<string, unknown>): Promise<void>;
};

export const HELPER_QUESTIONS: HelperBlock[] = [
  // One entry per helper session, e.g. referralsQuestions from lib/referrals/onboarding.ts.
  referralsQuestions,
  instagramQuestions,
  frontDeskQuestions,
];
