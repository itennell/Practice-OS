// The one shape every phone company adapter fills (Front Desk, bring-your-own
// phone account). The app reads new voicemails and texts every minute while it
// is open, so each adapter must be able to LIST them; webhooks are optional.

export type PhoneVendor = "spruce" | "twilio"; // "quo" is the documented fallback, not built
/** "sample" is the stand-in phone behind "Simulate a voicemail": it never texts anyone. */
export type MessageVendor = PhoneVendor | "sample";

export type Voicemail = {
  /** The company's own id; stored with the vendor so two companies never collide. */
  id: string;
  /** Caller ID in E.164 (+13125550144), or null when the number is hidden. */
  from: string | null;
  receivedAt: Date;
  /** Fetches the recording. Muse only takes a mono 16-bit WAV; anything else uses the fallback transcript. */
  audio: () => Promise<{ bytes: Buffer; mime: string }>;
  /** The phone company's own transcript, used only if Muse transcription fails. */
  providerTranscript?: string;
  /** The call it was left on (Twilio CallSid), so the inbox shows one row, not two. */
  callId?: string;
  /** Recording length in seconds. */
  seconds?: number;
};

/** One incoming call to the practice line, answered or not. */
export type Call = {
  id: string;
  from: string | null;
  receivedAt: Date;
  seconds: number;
  /** The phone company's word: completed, no-answer, busy, canceled, failed. */
  status: string;
};

export type InboundText = { id: string; from: string; body: string; receivedAt: Date };

export type CheckResult =
  | { ok: true; label: string } // "Connected: (312) 555-0100"
  | { ok: false; fix: string }; // one plain-English next step

export interface PhoneAdapter {
  vendor: MessageVendor;
  /** Live check for the Connect card and the Front Desk page. */
  check(): Promise<CheckResult>;
  /** Voicemails left at or after `since`, oldest first. */
  listVoicemails(since: Date): Promise<Voicemail[]>;
  /** Texts received at or after `since`, oldest first. */
  listInboundTexts(since: Date): Promise<InboundText[]>;
  /** Calls received at or after `since`, oldest first. Optional: not every company lists them. */
  listCalls?(since: Date): Promise<Call[]>;
  /** A voicemail's audio by its id, to play in the inbox. Optional. */
  recording?(id: string): Promise<{ bytes: Buffer; mime: string }>;
  sendText(to: string, body: string): Promise<{ id: string }>;
}

export class PhoneError extends Error {
  constructor(
    message: string,
    /** Plain-English next step shown to the clinician. */
    readonly fix: string,
    readonly status: number | null = null,
  ) {
    super(message);
  }
}
