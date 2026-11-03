import { REFERRALS_ONLY_DEMO } from "../features";

// The fixed chips under the chat box. Home builds its own from what's waiting and
// fills any gap from these. A plain module so server and client code can share it.
const FULL_SUGGESTIONS = ["What needs me this week?", "Draft a Good Faith Estimate", "Get me ready for CAQH"];

/** The referrals-only demo's tiles (lib/features.ts). */
export const REFERRAL_DEMO_SUGGESTIONS = [
  "Who should I reach out to this week?",
  "Find hospice and palliative care near me",
  "Debrief my coffee meeting",
  "Draft a letter to my top 3",
];

export const SUGGESTIONS = REFERRALS_ONLY_DEMO ? REFERRAL_DEMO_SUGGESTIONS : FULL_SUGGESTIONS;
