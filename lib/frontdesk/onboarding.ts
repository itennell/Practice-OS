// The Front Desk questions in onboarding chapter 6 ("Connect your tools"). The
// shape is lib/onboarding/helper-questions.ts (HelperBlock). "Text missed callers?"
// and her alert cell are asked by onboarding itself, so they aren't asked here.
import type { HelperBlock } from "../onboarding/helper-questions";
import { defaultGreeting, loadFrontDeskSetup, saveFrontDeskSetup } from "./setup";

export const frontDeskQuestions: HelperBlock = {
  helper: "front_desk",
  questions: [
    {
      id: "calendar",
      kind: "choices" as const,
      multi: false,
      ask: "Which calendar should Front Desk book free consults on?",
      help: "You'll connect it on the Front Desk page. You can change this later.",
      options: [
        { value: "calcom", label: "Cal.com" },
        { value: "google", label: "Google Calendar" },
      ],
    },
    {
      id: "consult_minutes",
      kind: "number" as const,
      min: 10,
      max: 60,
      unit: "minutes",
      ask: "How long is your free phone consult?",
      help: "Most are 15 minutes. If you use Cal.com, your Cal.com event decides this.",
    },
    {
      id: "greeting",
      kind: "text" as const,
      maxLength: 500,
      ask: "What should your voicemail greeting say?",
      help: "Skip this to use the suggested greeting on your Front Desk page. If you write your own, end it with: Message and data rates may apply. Reply STOP to opt out.",
    },
  ],
  async load() {
    const saved = await loadFrontDeskSetup();
    return { calendar: saved.calendar ?? "", consult_minutes: saved.consultMinutes, greeting: saved.greeting ?? (await defaultGreeting()) };
  },
  async save(answers) {
    const { calendar, consult_minutes, greeting } = answers;
    if (calendar !== undefined && calendar !== "" && calendar !== "calcom" && calendar !== "google") throw new Error("Pick Cal.com or Google Calendar.");
    if (consult_minutes !== undefined && (typeof consult_minutes !== "number" || !Number.isInteger(consult_minutes))) {
      throw new Error("Type the number of minutes, like 15.");
    }
    if (greeting !== undefined && typeof greeting !== "string") throw new Error("Type the greeting in words.");
    await saveFrontDeskSetup(
      {
        ...(calendar ? { calendar: calendar as "calcom" | "google" } : {}),
        ...(consult_minutes !== undefined ? { consultMinutes: consult_minutes as number } : {}),
        ...(typeof greeting === "string" ? { greeting: greeting.trim() || null } : {}),
      },
      "onboarding",
    );
  },
};
