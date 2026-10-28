import { createHash, randomBytes } from "node:crypto";
import { audit } from "../audit";
import { deleteConnection, getConnection, saveConnection, type Connection } from "../connections";
import { isAllowedGoogleScope } from "./google-scopes";
import { emailFromIdToken, exchangeGoogleCode, GOOGLE_BASE_SCOPES, googleAuthUrl, refreshGoogle } from "./google";
import { beginInstagram, openInstagramToken, refreshInstagram, uploadToRelay } from "./instagram";
import { ConnectError, createConnectState, takeConnectState, type ConnectProvider } from "./state";

// Connect buttons: one place to start a sign-in, finish it, and get a working
// token later. Interface agreed with the helper sessions in
// connect-interface-v0 (2026-10-28). Tokens only ever pass through
// lib/connections.ts, encrypted.

export { ConnectError, type ConnectProvider };
export { GOOGLE_SCOPES } from "./google";

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
    const scopes = unique([...GOOGLE_BASE_SCOPES, ...(existing?.scopes ?? []), ...(opts.scopes ?? [])]);
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = await createConnectState("google", scopes, redirectUri, verifier);
    return { authUrl: googleAuthUrl(scopes, redirectUri, state, challenge) };
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
      refreshToken: null,
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
    } catch {
      throw new NeedsConnectError(provider, requiredScopes); // revoked, or a Testing app's 7-day limit
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

/** For Instagram: puts a post image (JPEG) on the relay for one hour. */
export async function uploadPostImage(jpeg: Buffer): Promise<{ url: string; expiresAt: string }> {
  return uploadToRelay(jpeg, await getAccessToken("instagram"));
}

export async function disconnect(provider: ConnectProvider): Promise<void> {
  await deleteConnection(provider);
  await audit({ actor: "clinician", action: "disconnect", subjectType: "connection", subjectId: provider });
}
