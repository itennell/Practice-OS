// The three post styles and their fixed [Sample] captions. Plain data, so the
// onboarding screen (a client component) can import it; lib/instagram/style.ts has the Muse part.

export type StyleId = "warm" | "plain" | "professional";

export const STYLES: { id: StyleId; label: string; voice: string }[] = [
  { id: "warm", label: "Warm", voice: "Voice: warm and welcoming, like a kind front desk. Short, friendly sentences." },
  { id: "plain", label: "Plain", voice: "Voice: plain and direct. Very short sentences, simple steps and facts, no extra words." },
  { id: "professional", label: "Professional", voice: "Voice: calm and professional. Complete sentences, no slang, no emoji." },
];

export type StyleSample = { id: StyleId; label: string; text: string };

export const FALLBACK_SAMPLES: StyleSample[] = [
  {
    id: "warm",
    label: "Warm",
    text: "Booking your first visit is easy. Start with a free 15-minute phone call. We'll find a time that works for you. Tap the link in my bio to pick a time.",
  },
  {
    id: "plain",
    label: "Plain",
    text: "How to book: 1. Tap the link in my bio. 2. Pick a time for a free 15-minute call. 3. We set up your first session.",
  },
  {
    id: "professional",
    label: "Professional",
    text: "New clients may schedule a free 15-minute consultation through the link in our bio. After the call, we will schedule your first appointment.",
  },
];
