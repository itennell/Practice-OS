import { createHash, randomBytes } from "node:crypto";
import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection, type Connection } from "../connections";
import { isAllowedGoogleScope } from "./google-scopes";
import { emailFromIdToken, exchangeGoogleCode, GOOGLE_BASE_SCOPES, googleAuthUrl, GoogleTokenError, refreshGoogle, revokeGoogle } from "./google";
import { beginInstagram, deleteFromRelay, INSTAGRAM_NOT_READY, instagramReadiness, openInstagramToken, refreshInstagram, uploadToRelay, type Uploader } from "./instagram";
import { ConnectError, createConnectState, takeConnectState, type ConnectProvider } from "./state";

// Connect buttons: one place to start a sign-in, finish it, and get a working
// token later. Interface agreed with the helper sessions in
// connect-interface-v0 (2026-10-28). Tokens only ever pass through
// lib/connections.ts, encrypted.

export { ConnectError, type ConnectProvider };
export { GOOGLE_SCOPES } from "./google";

/** A sign-in that is fine but couldn't be refreshed just now (network, Google down). Try again later; don't ask her to reconnect. */
export class ConnectUnavailableError extends Error {}

/** Thrown by getAccessToken when she must press Connect (again) first. Callers turn it into a "Connect" prompt. */
export class NeedsConnectError extends Error {
  constructor(
    readonly provider: ConnectProvider,
    readonly missingScopes: string[],
  ) {
    super(`Connect ${provider === "google" ? "Google" : "Instagram"} in Settings › Connections first.`);
  }
}

const returnUri = (origin: string, provider: ConnectProvider) => `${origin.replace(/\/$/, "")}/api/connect/${provider}/return`;
const unique = (xs: string[]) => [...new Set(xs)];

/**
 * Starts a sign-in and returns the page to send her to. `origin` is the app's
 * own address on this computer (http://localhost:3000 or the desktop app's).
 */
export async function startConnect(provider: ConnectProvider, opts: { scopes?: string[]; origin: string }): Promise<{ authUrl: string }> {
  const redirectUri = returnUri(opts.origin, provider);
  if (provider === "google") {
    const unknown = (opts.scopes ?? []).filter((s) => !isAllowedGoogleScope(s));
    if (unknown.length > 0) throw new ConnectError("Practice-OS only asks Google for Gmail drafts and your calendar.");
    const existing = await getConnection("google");
    // Only ever re-ask for allowlisted scopes, even if an older sign-in somehow holds more.
    const kept = (existing?.scopes ?? []).filter(isAllowedGoogleScope);
    const scopes = unique([...GOOGLE_BASE_SCOPES, ...kept, ...(opts.scopes ?? [])]);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = await createConnectState("google", scopes, redirectUri, verifier);
    return { authUrl: googleAuthUrl(scopes, redirectUri, state, challenge) };
  }
  const readiness = await instagramReadiness();
  if (!readiness.ready) {
    console.error("connect instagram: not ready:", readiness.reason);
    throw new ConnectError(INSTAGRAM_NOT_READY);
  }
  const key = randomBytes(32);
  const state = await createConnectState("instagram", [], redirectUri, key.toString("base64"));
  return { authUrl: await beginInstagram(state, redirectUri, key) };
}

/** Finishes a sign-in from the return page's query string and saves it. */
export async function finishConnect(provider: ConnectProvider, params: URLSearchParams): Promise<Connection> {
  const st = await takeConnectState(provider, params.get("state"));
  const error = params.get("error");
  if (error) {
    await audit({ actor: "clinician", action: "connect_declined", subjectType: "connection", subjectId: provider, details: { error } });
    throw new ConnectError(error === "access_denied" || error === "denied" || error === "user_denied" ? "Sign-in was cancelled." : "Sign-in didn't finish. Press Connect to try again.");
  }

  let connection: Connection;
  if (provider === "google") {
    const code = params.get("code");
    if (!code) throw new ConnectError("Google didn't send a sign-in code. Press Connect again.");
    const tokens = await exchangeGoogleCode(code, st.secret, st.redirectUri);
    const previous = await getConnection("google");
    const refreshToken = tokens.refresh_token ?? previous?.refreshToken ?? null;
    if (!refreshToken) throw new ConnectError("Google didn't allow staying signed in. Press Connect again.");
    connection = {
      provider: "google",
      accountLabel: emailFromIdToken(tokens.id_token) ?? previous?.accountLabel ?? null,
      accessToken: tokens.access_token,
      refreshToken,
      scopes: tokens.scope ? tokens.scope.split(" ") : st.scopes,
      expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      meta: {},
    };
  } else {
    const sealed = params.get("sealed");
    if (!sealed) throw new ConnectError("Instagram didn't finish signing in. Press Connect again.");
    const token = openInstagramToken(sealed, Buffer.from(st.secret, "base64"), st.state);
    connection = {
      provider: "instagram",
      accountLabel: `@${token.username}`,
      accessToken: token.accessToken,
      // Instagram has no refresh token; this encrypted field holds the relay's upload key for her account.
      refreshToken: token.uploadKey,
      scopes: token.scopes,
      expiresAt: new Date(Date.now() + token.expiresIn * 1000),
      meta: { userId: token.userId, connectedAt: new Date().toISOString() },
    };
  }
  await saveConnection(connection);
  await audit({ actor: "clinician", action: "connect", subjectType: "connection", subjectId: provider, details: { scopes: connection.scopes } });
  return connection;
}

const DAY_MS = 86_400_000;

/**
 * A working access token with at least `requiredScopes`, refreshed when it is
 * close to expiring. Throws NeedsConnectError when she must press Connect.
 */
export async function getAccessToken(provider: ConnectProvider, requiredScopes: string[] = []): Promise<string> {
  const c = await getConnection(provider);
  if (!c?.accessToken) throw new NeedsConnectError(provider, requiredScopes);
  const missing = requiredScopes.filter((s) => !c.scopes.includes(s));
  if (missing.length > 0) throw new NeedsConnectError(provider, missing);
  const msLeft = c.expiresAt ? c.expiresAt.getTime() - Date.now() : Infinity;

  if (provider === "google") {
    if (msLeft > 60_000) return c.accessToken;
    if (!c.refreshToken) throw new NeedsConnectError(provider, requiredScopes);
    try {
      const t = await refreshGoogle(c.refreshToken);
      await saveConnection({ ...c, accessToken: t.access_token, refreshToken: t.refresh_token ?? c.refreshToken, expiresAt: new Date(Date.now() + t.expires_in * 1000) });
      return t.access_token;
    } catch (err) {
      // invalid_grant: revoked, expired, or a Testing app's 7-day limit. Anything else is temporary.
      if (err instanceof GoogleTokenError && err.code === "invalid_grant") throw new NeedsConnectError(provider, requiredScopes);
      throw new ConnectUnavailableError("Couldn't reach Google just now. Try again in a minute.");
    }
  }

  // Instagram: about 60 days. Refresh in the last week, once the token is a day old.
  if (msLeft <= 0) throw new NeedsConnectError(provider, requiredScopes);
  const connectedAt = Date.parse(String(c.meta.connectedAt ?? "")) || 0;
  if (msLeft < 7 * DAY_MS && Date.now() - connectedAt > DAY_MS) {
    try {
      const t = await refreshInstagram(c.accessToken);
      await saveConnection({ ...c, accessToken: t.accessToken, expiresAt: new Date(Date.now() + t.expiresIn * 1000), meta: { ...c.meta, connectedAt: new Date().toISOString() } });
      return t.accessToken;
    } catch {
      return c.accessToken; // still valid for now; the next call tries again
    }
  }
  return c.accessToken;
}

export const INSTAGRAM_PUBLISH_SCOPE = "instagram_business_content_publish";

/** Her account on the relay. Needs a sign-in that granted publishing. */
async function instagramUploader(): Promise<Uploader> {
  await getAccessToken("instagram", [INSTAGRAM_PUBLISH_SCOPE]);
  const c = await getConnection("instagram");
  const userId = String(c?.meta.userId ?? "");
  if (!c?.refreshToken || !userId) throw new NeedsConnectError("instagram", []);
  return { userId, uploadKey: c.refreshToken };
}

/** For Instagram: puts a post image (JPEG) on the relay; public for at most an hour. */
export async function uploadPostImage(jpeg: Buffer): Promise<{ url: string; expiresAt: string }> {
  return uploadToRelay(jpeg, await instagramUploader());
}

/** Call once Instagram's media container is FINISHED, so the image stops being public right away. */
export async function deletePostImage(url: string): Promise<void> {
  return deleteFromRelay(url, await instagramUploader());
}

/**
 * Forgets the sign-in here, and for Google also revokes it at Google. Instagram
 * has no revoke call: she removes Practice-OS in Instagram's own settings
 * (Settings › Website permissions › Apps and websites), which `note` says.
 */
export async function disconnect(provider: ConnectProvider): Promise<{ revoked: boolean; note?: string }> {
  const c = await getConnection(provider);
  let revoked = false;
  if (provider === "google" && c) revoked = await revokeGoogle(c.refreshToken ?? c.accessToken ?? "");
  await deleteConnection(provider);
  await audit({ actor: "clinician", action: "disconnect", subjectType: "connection", subjectId: provider, details: { revoked } });
  if (provider === "instagram") {
    return { revoked, note: "To remove Practice-OS from your account too, open Instagram › Settings › Website permissions › Apps and websites." };
  }
  return { revoked, note: revoked ? undefined : "Google didn't confirm. You can also remove Practice-OS at myaccount.google.com › Security › Third-party access." };
}
