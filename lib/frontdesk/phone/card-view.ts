import { prettyPhone } from "./numbers";

// What the phone Connect card says, in plain code so every state is tested.
// The card follows Front Desk's phone adapter (lib/frontdesk/phone/index.ts):
// the developer demo line wins when it is on, so the Spruce steps only show
// when nothing is connected.

export type PhoneCardStatus = { connected: boolean; label?: string; fix?: string; devLine?: boolean; number?: string; note?: string };

export type PhoneCardView = {
  description: string;
  connected: boolean;
  accountLabel?: string;
  /** A plain status line under the header (texting not approved yet). */
  note?: string;
  /** Something is wrong with a connected line. */
  fix?: string;
  /** Spruce's three steps and token box. */
  showSpruceSetup: boolean;
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
      showSpruceSetup: false,
      canDisconnect: false,
    };
  }
  if (s.connected) {
    return { description: OWN_LINE, connected: true, accountLabel: s.label?.replace(/^Connected: /, ""), fix: s.fix, showSpruceSetup: false, canDisconnect: true };
  }
  return { description: OWN_LINE, connected: false, showSpruceSetup: true, canDisconnect: false };
}
