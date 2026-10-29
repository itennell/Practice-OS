import type { ConnectionStatus } from "@/components/connections/registry";
import { getConnection, type Provider } from "../connections";
import { INSTAGRAM_NOT_READY, peekInstagramReadiness } from "./instagram";

/** What a Connect card shows. Never includes a token. */
export async function getConnectionStatus(provider: string): Promise<ConnectionStatus> {
  const c = await getConnection(provider as Provider).catch(() => null);
  // Never waits on the relay: the last known answer, refreshed in the background.
  // Set for a stored sign-in too, so "Connect again" isn't offered when it can't work.
  const readiness = provider === "instagram" ? peekInstagramReadiness() : null;
  const notReady = readiness && !readiness.ready ? { notReady: INSTAGRAM_NOT_READY } : {};
  if (!c) return { provider, connected: false, scopes: [], ...notReady };
  return {
    ...notReady,
    provider,
    connected: Boolean(c.accessToken || c.meta?.lineId || c.meta?.eventTypeId),
    accountLabel: c.accountLabel ?? undefined,
    scopes: c.scopes,
    expiresAt: c.expiresAt?.toISOString(),
  };
}
