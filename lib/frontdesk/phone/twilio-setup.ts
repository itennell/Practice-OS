// The guided Twilio setup on the phone card (docs/self-hosting/phone.md has the
// same steps). Plain data, so the words are tested for reading level.

export const TWILIO_SIGNUP_URL = "https://www.twilio.com/try-twilio";
export const TWILIO_CONSOLE_URL = "https://console.twilio.com/";
export const TWILIO_BUY_NUMBER_URL = "https://console.twilio.com/us1/develop/phone-numbers/manage/search";
export const TWILIO_TOLLFREE_URL = "https://console.twilio.com/us1/develop/sms/regulatory-compliance/toll-free-verification";

export type TwilioStepId = "account" | "upgrade" | "number" | "keys";
export const TWILIO_STEP_ORDER: TwilioStepId[] = ["account", "upgrade", "number", "keys"];

export const TWILIO_STEP_TEXT: Record<TwilioStepId, { title: string; see: string; more?: string }> = {
  account: {
    title: "Make a Twilio account.",
    see: "The Twilio Console home page.",
    more: "Twilio is the phone company Front Desk uses. You pay Twilio for what you use.",
  },
  upgrade: {
    title: "Add a payment card in Twilio to leave the free trial.",
    see: "The word Trial is gone from the top of the page.",
    more: "A trial can only text 5 numbers you check first, and it can't be approved for texting.",
  },
  number: {
    title: "Buy a toll-free number in Twilio.",
    see: "Your new number under Phone Numbers, then Active numbers.",
    more: "It costs about $2 a month, plus a little for each call and text. Twilio may ask about your practice first.",
  },
  keys: {
    title: "Copy your Account SID and Auth Token from the Twilio home page and paste them here.",
    see: "Connected, with your number. Nothing on your Twilio account changes yet."
  },
};

/** Shown once she is connected, until the carriers approve texting. */
export const TEXTING_APPROVAL = {
  title: "One more step: ask Twilio to approve texting.",
  steps: [
    "In Twilio, open Messaging, then Regulatory compliance, then Toll-free verifications.",
    "Pick your number and fill in the form about your practice.",
    "For what the texts are for, say: appointment times for people who called and left a voicemail.",
  ],
  wait: "There is no fee. It usually takes 3 to 15 business days. Until then, calls and voicemails work, but texts to callers don't go out yet.",
};

/** Shown once she is connected, before Practice-OS changes anything on her number. */
export const VOICEMAIL_OFFER = {
  title: "Calls to this number will go to your greeting and voicemail.",
  body: "Practice-OS changes this one setting on your Twilio number when you press the button. Aeon then reads each voicemail and texts the caller your open times. You can undo it.",
  button: "Send calls to my greeting and voicemail",
  undo: "Undo: put my number's old call setting back",
};
