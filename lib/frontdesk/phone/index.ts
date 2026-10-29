import { getConnection, type Provider } from "../../connections";
import { spruceAdapter } from "./spruce";
import { twilioAdapter, twilioFromEnv, type TwilioConfig } from "./twilio";
import type { PhoneAdapter, PhoneVendor } from "./types";

export * from "./types";
export { prettyPhone, toE164 } from "./numbers";

// The 'phone' connection row (desktop-app's migration 017 adds the provider):
// the token is encrypted by lib/connections.ts; meta names her phone company.
// lineId is the Spruce internal endpoint (phone line) to read and send from.
// For Twilio, accountSid, phoneNumber and numberSid name her account and number (the Auth Token is the encrypted token).
export type PhoneMeta = {
  vendor: PhoneVendor;
  lineId?: string;
  lineLabel?: string;
  accountSid?: string;
  phoneNumber?: string;
  numberSid?: string;
  /** She pressed "Send calls to my greeting and voicemail"; the number's old call setting is kept for Undo. */
  voicemailOn?: boolean;
  previousVoiceUrl?: string | null;
  previousVoiceMethod?: string | null;
};
export const PHONE_PROVIDER: Provider = "phone";

/** Her phone company, or null when nothing is connected. Isaiah's dev Twilio line wins when switched on. */
export async function getPhoneAdapter(): Promise<PhoneAdapter | null> {
  const dev = twilioFromEnv();
  if (dev) return twilioAdapter(dev);
  const conn = await getConnection(PHONE_PROVIDER).catch(() => null);
  if (!conn?.accessToken) return null;
  const meta = conn.meta as Partial<PhoneMeta>;
  if (meta.vendor === "spruce") return spruceAdapter({ token: conn.accessToken, endpointId: meta.lineId });
  if (meta.vendor === "twilio") {
    const own = await ownTwilioConfig();
    return own ? twilioAdapter(own) : null;
  }
  return null;
}

/** Her own Twilio line, or null when she hasn't connected one. */
export async function ownTwilioConfig(): Promise<(TwilioConfig & Pick<PhoneMeta, "numberSid" | "voicemailOn" | "previousVoiceUrl" | "previousVoiceMethod">) | null> {
  const conn = await getConnection(PHONE_PROVIDER).catch(() => null);
  const meta = (conn?.meta ?? {}) as Partial<PhoneMeta>;
  if (!conn?.accessToken || meta.vendor !== "twilio" || !meta.accountSid || !meta.phoneNumber) return null;
  return {
    accountSid: meta.accountSid,
    authToken: conn.accessToken,
    phoneNumber: meta.phoneNumber,
    numberSid: meta.numberSid,
    voicemailOn: meta.voicemailOn,
    previousVoiceUrl: meta.previousVoiceUrl,
    previousVoiceMethod: meta.previousVoiceMethod,
  };
}
