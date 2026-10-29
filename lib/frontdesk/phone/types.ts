// The one shape every phone company adapter fills (Front Desk, bring-your-own
// phone account). The app reads new voicemails and texts every minute while it
// is open, so each adapter must be able to LIST them; webhooks are optional.

export type PhoneVendor = "spruce" | "twilio"; // "quo" is the documented fallback, not built

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
};

export type InboundText = { id: string; from: string; body: string; receivedAt: Date };

export type CheckResult =
  | { ok: true; label: string } // "Connected: (312) 555-0100"
  | { ok: false; fix: string }; // one plain-English next step

export interface PhoneAdapter {
  vendor: PhoneVendor;
  /** Live check for the Connect card and the Front Desk page. */
  check(): Promise<CheckResult>;
  /** Voicemails left at or after `since`, oldest first. */
  listVoicemails(since: Date): Promise<Voicemail[]>;
  /** Texts received at or after `since`, oldest first. */
  listInboundTexts(since: Date): Promise<InboundText[]>;
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
