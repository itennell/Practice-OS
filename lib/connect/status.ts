import type { ConnectionStatus } from "@/components/connections/registry";
import { getConnection, type Provider } from "../connections";
import { phoneStatus } from "../frontdesk/connect";

/** The Google card on a copy with no Google client set up. */
export const GOOGLE_LATER = "Gmail drafts come later. For now, approved referral letters show as a preview in Practice-OS.";

/** What a Connect card shows. Never includes a token. */
export async function getConnectionStatus(provider: string): Promise<ConnectionStatus> {
  // The phone follows Front Desk's own adapter choice, so the developer demo line shows too.
  if (provider === "phone") {
    const p = await phoneStatus().catch(() => null);
    if (!p) return { provider, connected: false, scopes: [] };
    return {
      provider,
      connected: p.connected,
      accountLabel: p.check?.ok ? p.check.label : undefined,
      scopes: [],
      phone: { devLine: Boolean(p.devLine), vendor: p.vendor, number: p.number, note: p.note, texting: p.texting, voicemailOn: p.voicemailOn, fix: p.check && !p.check.ok ? p.check.fix : undefined },
    };
  }
  // Google needs a developer's own OAuth client (docs/self-hosting/google.md): without one, say "later" instead of a dead-end button.
  if (provider === "google" && !process.env.GOOGLE_CLIENT_ID) {
    const g = await getConnection("google").catch(() => null);
    if (!g) return { provider, connected: false, scopes: [], notReady: GOOGLE_LATER };
  }
  const c = await getConnection(provider as Provider).catch(() => null);
  // Instagram posting is cut for now (its card is information only), so the relay isn't asked.
  if (!c) return { provider, connected: false, scopes: [] };
  return {
    provider,
    connected: Boolean(c.accessToken || c.meta?.lineId || c.meta?.eventTypeId),
    accountLabel: c.accountLabel ?? undefined,
    scopes: c.scopes,
    expiresAt: c.expiresAt?.toISOString(),
  };
}
