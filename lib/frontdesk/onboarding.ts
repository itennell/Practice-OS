// The Front Desk question in onboarding chapter 6 ("Connect your tools"). The
// shape is lib/onboarding/helper-questions.ts (HelperBlock). "Text missed callers?"
// and her alert cell are asked by onboarding itself; the calendar is the Cal.com
// card in the same chapter, and its consult event sets the consult length.
import type { HelperBlock } from "../onboarding/helper-questions";
import { defaultGreeting, loadFrontDeskSetup, saveFrontDeskSetup } from "./setup";

export const frontDeskQuestions: HelperBlock = {
  helper: "front_desk",
  questions: [
    {
      id: "greeting",
      kind: "text" as const,
      maxLength: 500,
      ask: "What should your voicemail greeting say?",
      help: "This is the suggested greeting. Change it if you like, keeping the last two sentences, then record it in your phone app.",
    },
  ],
  async load() {
    const saved = await loadFrontDeskSetup();
    return { greeting: saved.greeting ?? (await defaultGreeting()) };
  },
  async save(answers) {
    const { greeting } = answers;
    if (greeting !== undefined && typeof greeting !== "string") throw new Error("Type the greeting in words.");
    if (typeof greeting === "string") await saveFrontDeskSetup({ greeting: greeting.trim() || null }, "onboarding");
  },
};
