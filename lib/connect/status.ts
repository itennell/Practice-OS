import type { ConnectionStatus } from "@/components/connections/registry";
import { getConnection, type Provider } from "../connections";
import { INSTAGRAM_NOT_READY, instagramReadiness } from "./instagram";

/** What a Connect card shows. Never includes a token. */
export async function getConnectionStatus(provider: string): Promise<ConnectionStatus> {
  const c = await getConnection(provider as Provider).catch(() => null);
  if (!c) {
    if (provider === "instagram" && !(await instagramReadiness()).ready) return { provider, connected: false, scopes: [], notReady: INSTAGRAM_NOT_READY };
    return { provider, connected: false, scopes: [] };
  }
  return {
    provider,
    connected: Boolean(c.accessToken || c.meta?.lineId || c.meta?.eventTypeId),
    accountLabel: c.accountLabel ?? undefined,
    scopes: c.scopes,
    expiresAt: c.expiresAt?.toISOString(),
  };
}
