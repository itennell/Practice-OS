import { prettyPhone } from "./numbers";

// What the phone Connect card says, in plain code so every state is tested.
// The card follows Front Desk's phone adapter (lib/frontdesk/phone/index.ts):
// the developer demo line wins when it is on, so the setup steps only show
// when nothing is connected.

export type PhoneCardStatus = { connected: boolean; label?: string; fix?: string; devLine?: boolean; vendor?: string; number?: string; note?: string; texting?: string; voicemailOn?: boolean };

export type PhoneCardView = {
  description: string;
  connected: boolean;
  accountLabel?: string;
  /** A plain status line under the header (texting not approved yet). */
  note?: string;
  /** Something is wrong with a connected line. */
  fix?: string;
  /** The guided setup (Twilio by default, Spruce as the alternative). */
  showSetup: boolean;
  /** Her own Twilio line: texting approval isn't done yet, so the card explains it. */
  showTextingApproval: boolean;
  /** Her own Twilio line, calls not sent to voicemail yet: say what will change and offer the button. */
  offerVoicemail: boolean;
  /** Her own Twilio line, calls go to voicemail: offer Undo and putting her latest greeting on the number. */
  canUndoVoicemail: boolean;
  canRefreshGreeting: boolean;
  /** Only her own phone company can be disconnected here; the demo line is set in .env. */
  canDisconnect: boolean;
};

const OWN_LINE = "Front Desk reads your voicemails and texts from your own phone company and texts callers your open consult times.";
const DEMO_LINE = "Front Desk answers this practice's missed calls and texts on a demo phone line and texts callers your open consult times.";

export function phoneCardView(s: PhoneCardStatus): PhoneCardView {
  if (s.devLine) {
    return {
      description: DEMO_LINE,
      connected: true,
      accountLabel: `Demo line ${s.number ? prettyPhone(s.number) : ""}, run by Twilio`.replace(/ {2}/, " "),
      note: s.note,
      fix: s.fix,
      showSetup: false,
      showTextingApproval: false,
      offerVoicemail: false,
      canUndoVoicemail: false,
      canRefreshGreeting: false,
      canDisconnect: false,
    };
  }
  if (s.connected) {
    const twilio = s.vendor === "twilio";
    return {
      description: OWN_LINE,
      connected: true,
      accountLabel: s.label?.replace(/^Connected: /, ""),
      note: s.note,
      fix: s.fix,
      showSetup: false,
      showTextingApproval: twilio && s.texting !== "TWILIO_APPROVED",
      offerVoicemail: twilio && !s.voicemailOn,
      canUndoVoicemail: twilio && Boolean(s.voicemailOn),
      canRefreshGreeting: twilio && Boolean(s.voicemailOn),
      canDisconnect: true,
    };
  }
  return { description: OWN_LINE, connected: false, showSetup: true, showTextingApproval: false, offerVoicemail: false, canUndoVoicemail: false, canRefreshGreeting: false, canDisconnect: false };
}
