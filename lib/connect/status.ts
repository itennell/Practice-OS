import type { ConnectionStatus } from "@/components/connections/registry";
import { getConnection, type Provider } from "../connections";
import { phoneStatus } from "../frontdesk/connect";

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
      phone: { devLine: Boolean(p.devLine), number: p.number, note: p.note, fix: p.check && !p.check.ok ? p.check.fix : undefined },
    };
  }
  const c = await getConnection(provider as Provider).catch(() => null);
  if (!c) return { provider, connected: false, scopes: [] };
  return {
    provider,
    connected: Boolean(c.accessToken || c.meta?.lineId || c.meta?.eventTypeId),
    accountLabel: c.accountLabel ?? undefined,
    scopes: c.scopes,
    expiresAt: c.expiresAt?.toISOString(),
  };
}
