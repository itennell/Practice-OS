import { getConnection, type Provider } from "../../connections";
import { spruceAdapter } from "./spruce";
import { twilioAdapter, twilioFromEnv } from "./twilio";
import type { PhoneAdapter, PhoneVendor } from "./types";

export * from "./types";
export { prettyPhone, toE164 } from "./numbers";

// The 'phone' connection row (desktop-app's migration 017 adds the provider):
// the token is encrypted by lib/connections.ts; meta names her phone company.
// lineId is the Spruce internal endpoint (phone line) to read and send from.
export type PhoneMeta = { vendor: PhoneVendor; lineId?: string; lineLabel?: string };
export const PHONE_PROVIDER: Provider = "phone";

/** Her phone company, or null when nothing is connected. Isaiah's dev Twilio line wins when switched on. */
export async function getPhoneAdapter(): Promise<PhoneAdapter | null> {
  const dev = twilioFromEnv();
  if (dev) return twilioAdapter(dev);
  const conn = await getConnection(PHONE_PROVIDER).catch(() => null);
  if (!conn?.accessToken) return null;
  const meta = conn.meta as Partial<PhoneMeta>;
  if (meta.vendor === "spruce") return spruceAdapter({ token: conn.accessToken, endpointId: meta.lineId });
  return null;
}
