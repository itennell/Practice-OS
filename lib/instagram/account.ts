import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection } from "../connections";
import { InstagramApiError, InstagramGraph, type Fetch } from "./graph";
import type { RedeemedToken } from "./relay";

// Her Instagram sign-in, stored only through lib/connections.ts (encrypted).
// meta holds the Instagram user id and when the long-lived token was issued,
// because Meta refreshes a token only once it is at least 24 hours old.

export type InstagramAccount = { token: string; igUserId: string; username: string; expiresAt: Date | null };

const DAY = 24 * 60 * 60 * 1000;
/** Refresh when fewer than this many days are left (tokens last about 60). */
const REFRESH_WHEN_DAYS_LEFT = 14;

export async function saveRedeemedToken(t: RedeemedToken, fetchImpl?: Fetch): Promise<{ username: string }> {
  const me = await new InstagramGraph(t.access_token, fetchImpl).me();
  await saveConnection({
    provider: "instagram",
    accountLabel: me.username,
    accessToken: t.access_token,
    refreshToken: null,
    scopes: t.permissions,
    expiresAt: new Date(Date.now() + t.expires_in * 1000),
    meta: { ig_user_id: me.user_id ?? t.user_id, issued_at: new Date().toISOString() },
  });
  await audit({ actor: "clinician", action: "instagram_connected", subjectType: "connection", details: { username: me.username } });
  return { username: me.username };
}

export type LiveCheck =
  | { state: "not_connected" }
  | { state: "connected"; username: string; expiresAt: string | null }
  | { state: "needs_reconnect"; username: string | null; reason: string };

/** What the Connect card shows: asks Instagram who the saved token belongs to. */
export async function liveCheck(fetchImpl?: Fetch): Promise<LiveCheck> {
  const c = await getConnection("instagram");
  if (!c?.accessToken) return { state: "not_connected" };
  if (c.expiresAt && c.expiresAt.getTime() <= Date.now()) {
    return { state: "needs_reconnect", username: c.accountLabel, reason: "The Instagram sign-in ran out after 60 days." };
  }
  try {
    const me = await new InstagramGraph(c.accessToken, fetchImpl).me();
    return { state: "connected", username: me.username, expiresAt: c.expiresAt?.toISOString() ?? null };
  } catch (err) {
    if (err instanceof InstagramApiError && err.tokenInvalid) {
      return { state: "needs_reconnect", username: c.accountLabel, reason: "Instagram no longer accepts this sign-in." };
    }
    throw err;
  }
}

/** The saved account, refreshing the token first when it is close to running out. */
export async function instagramAccount(fetchImpl?: Fetch, now = new Date()): Promise<InstagramAccount | null> {
  const c = await getConnection("instagram");
  if (!c?.accessToken) return null;
  const igUserId = String(c.meta.ig_user_id ?? "");
  if (!igUserId) return null;
  let account: InstagramAccount = { token: c.accessToken, igUserId, username: c.accountLabel ?? "", expiresAt: c.expiresAt };

  const issuedAt = typeof c.meta.issued_at === "string" ? new Date(c.meta.issued_at) : null;
  const daysLeft = c.expiresAt ? (c.expiresAt.getTime() - now.getTime()) / DAY : Infinity;
  const oldEnough = issuedAt ? now.getTime() - issuedAt.getTime() >= DAY : false;
  if (daysLeft > 0 && daysLeft < REFRESH_WHEN_DAYS_LEFT && oldEnough) {
    const fresh = await new InstagramGraph(c.accessToken, fetchImpl).refresh();
    const expiresAt = new Date(now.getTime() + fresh.expires_in * 1000);
    await saveConnection({ ...c, accessToken: fresh.access_token, expiresAt, meta: { ...c.meta, issued_at: now.toISOString() } });
    await audit({ actor: "aeon", action: "instagram_token_refreshed", subjectType: "connection", details: { expires_at: expiresAt } });
    account = { ...account, token: fresh.access_token, expiresAt };
  }
  return account;
}

export async function disconnectInstagram(): Promise<void> {
  await deleteConnection("instagram");
  await audit({ actor: "clinician", action: "instagram_disconnected", subjectType: "connection", details: {} });
}
