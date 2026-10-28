import { randomBytes } from "node:crypto";
import { db } from "../db";
import { decryptSecret, encryptSecret } from "../secrets";

// A sign-in in progress (practice_os.connect_states): created when she presses
// Connect, used once when the sign-in comes back, gone after 10 minutes.
// The state value doubles as the guard against a forged return: a return
// without a live state row is refused.

export type ConnectProvider = "google" | "instagram";

export type ConnectState = { state: string; scopes: string[]; redirectUri: string; secret: string };

const context = (provider: ConnectProvider, state: string) => `connect:${provider}:${state}`;

export async function createConnectState(provider: ConnectProvider, scopes: string[], redirectUri: string, secret: string): Promise<string> {
  const state = randomBytes(32).toString("base64url");
  await db()`delete from practice_os.connect_states where expires_at < now()`;
  await db()`
    insert into practice_os.connect_states (state, provider, scopes, redirect_uri, secret_enc)
    values (${state}, ${provider}, ${scopes}, ${redirectUri}, ${encryptSecret(secret, context(provider, state))})
  `;
  return state;
}

/** Claims a state once. Throws if it is unknown, used, expired or for another provider. */
export async function takeConnectState(provider: ConnectProvider, state: string | null): Promise<ConnectState> {
  if (!state) throw new ConnectError("This sign-in link is missing its state. Press Connect again.");
  const [row] = await db()`
    delete from practice_os.connect_states
    where state = ${state} and provider = ${provider}
    returning scopes, redirect_uri, secret_enc, expires_at > now() as live
  `;
  if (!row || !row.live) throw new ConnectError("This sign-in expired or was already used. Press Connect again.");
  return { state, scopes: row.scopes, redirectUri: row.redirect_uri, secret: decryptSecret(row.secret_enc, context(provider, state)) };
}

/** A sign-in that can't finish, with a message she can read. */
export class ConnectError extends Error {}
