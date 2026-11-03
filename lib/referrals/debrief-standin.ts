// Tests only (PLAYWRIGHT_DEBRIEF_STANDIN=1, like the studio and research stand-ins):
// a fixed transcript and fixed Muse replies for the coffee debrief, so the e2e
// runs with no Muse key and no network. Every plain-code check still runs on
// them: the crisis check, the privacy pass, the field checks and the letter rules.
// Fictional people and offices only. Refused on Vercel.
import type OpenAI from "openai";
import type { ChatParams } from "../meta";

/** A debrief of coffee with the fictional [Sample] Fernhollow Pediatrics, with one patient story in it. */
export const STANDIN_TRANSCRIPT =
  "I just had coffee with the office manager at Fernhollow Pediatrics. " +
  "They send referrals by fax, and the front desk coordinator handles them. " +
  "They mostly see new and expecting parents, and most families have Blue Cross or pay privately. " +
  "They need a therapist who can see new parents within two weeks, because the therapists they use now have a waitlist. " +
  "One of their patients, Maria Lopez, 34, was just diagnosed with postpartum depression. " +
  "The best time to reach the office is Tuesday mornings. " +
  "We both trained at Loyola, so that was a nice connection. " +
  "She said I should meet Jenna Cho, the lactation consultant at Marigold Birth Center. " +
  "I said I would send my flyer and my openings next week.";

/** What Muse would fill in, plus one person the debrief never named (plain code drops it). */
export const STANDIN_FIELDS = {
  refers_via: "fax",
  referral_contact: "front desk coordinator",
  populations: ["new and expecting parents"],
  needs_from_therapist: "A therapist who can see new parents within two weeks",
  waitlist: true,
  payer_mix: "Mostly Blue Cross or private pay",
  best_time: "Tuesday mornings",
  last_meeting_summary:
    "Coffee with the office manager at Fernhollow Pediatrics. They refer by fax through the front desk coordinator and need a therapist who can see new parents within two weeks.",
  connection_points: "We both trained at Loyola",
  who_else: [
    { name: "Jenna Cho", role: "lactation consultant", organization: "Marigold Birth Center" },
    { name: "Sam Patel", role: "social worker", organization: "Northwestern" },
  ],
  follow_up_points: ["Send my flyer and my openings next week"],
};

function reply(message: Partial<OpenAI.Chat.ChatCompletionMessage>): OpenAI.Chat.ChatCompletion {
  return {
    id: "standin",
    object: "chat.completion",
    created: 0,
    model: "muse-spark-1.3",
    choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: { role: "assistant", content: null, refusal: null, ...message } }],
  } as OpenAI.Chat.ChatCompletion;
}

function providerName(params: ChatParams): string {
  const user = params.messages.find((m) => m.role === "user");
  const text = typeof user?.content === "string" ? user.content : "";
  try {
    const data = JSON.parse(text.slice(text.indexOf("{"))) as { provider?: { name?: string } };
    return data.provider?.name ?? "your office";
  } catch {
    return "your office";
  }
}

/** Stands in for lib/meta.ts chat(): the profile tool call, then the follow-up email. */
export async function standinChat(feature: string, params: ChatParams): Promise<OpenAI.Chat.ChatCompletion> {
  if (!debriefStandin()) throw new Error("PLAYWRIGHT_DEBRIEF_STANDIN is for tests only.");
  if (feature === "referral_debrief") {
    return reply({
      tool_calls: [{ id: "call_1", type: "function", function: { name: "record_debrief", arguments: JSON.stringify(STANDIN_FIELDS) } }],
    });
  }
  const letter =
    `Dear ${providerName(params)},\n\nThank you for meeting me for coffee. It was good to hear that your office sends referrals by fax through ` +
    "your front desk coordinator, and that you need a therapist who can see new parents within two weeks. As I said, I will send my flyer " +
    "and my openings next week.\n\nI'm glad to talk again any time.\n\nWarmly,\nDana Reyes, LCPC\nReyes Counseling PLLC";
  return reply({ content: JSON.stringify({ subject: "Thank you for coffee", letter }) });
}

export async function standinTranscribe(): Promise<string> {
  if (!debriefStandin()) throw new Error("PLAYWRIGHT_DEBRIEF_STANDIN is for tests only.");
  return STANDIN_TRANSCRIPT;
}

/**
 * On only for the e2e: never on Vercel, and on a production build only when the
 * Playwright web server also sets PRACTICE_OS_E2E=1 (playwright.config.ts).
 */
export const debriefStandin = () =>
  process.env.PLAYWRIGHT_DEBRIEF_STANDIN === "1" && !process.env.VERCEL && (process.env.NODE_ENV !== "production" || process.env.PRACTICE_OS_E2E === "1");
