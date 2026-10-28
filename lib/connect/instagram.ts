import { requireEnv } from "../env";
import { GRAPH } from "../../relay/lib/instagram";
import type { SealedSignIn } from "../../relay/lib/handlers";
import { unseal } from "../../relay/lib/seal";

// The app's half of Instagram sign-in. Meta only returns a sign-in to a
// registered https address, and the code exchange needs the app secret, so
// the Connect relay (relay/) does that part. The token comes back sealed with
// a key only this app holds.

const relay = () => requireEnv("RELAY_URL").replace(/\/$/, "");

/** Asks the relay for Meta's sign-in page. `key` is the one-time key the token comes back sealed with. */
export async function beginInstagram(state: string, returnTo: string, key: Buffer): Promise<string> {
  const res = await fetch(`${relay()}/api/connect/instagram/begin`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, returnTo, key: key.toString("base64") }),
  });
  const json = (await res.json().catch(() => ({}))) as { authUrl?: string; error?: string };
  if (!res.ok || !json.authUrl) throw new Error(`The Connect relay refused: ${json.error ?? res.status}`);
  return json.authUrl;
}

/** The token plus the relay's upload key for her account (see relay/lib/handlers.ts). */
export function openInstagramToken(sealed: string, key: Buffer, state: string): SealedSignIn {
  return JSON.parse(unseal(sealed, key, `instagram-token:${state}`)) as SealedSignIn;
}

/** Long-lived tokens last about 60 days and can be refreshed once they are a day old (Meta's docs, 2026-10-28). */
export async function refreshInstagram(accessToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(`${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken })}`);
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error(`Instagram refresh failed (${res.status})`);
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) };
}

export type Uploader = { userId: string; uploadKey: string };
const uploaderHeaders = (u: Uploader) => ({ authorization: `Bearer ${u.uploadKey}`, "x-instagram-user": u.userId });

/** Puts a post image (JPEG, made with sharp) on the relay for at most an hour, for Instagram to fetch. */
export async function uploadToRelay(jpeg: Buffer, u: Uploader): Promise<{ url: string; expiresAt: string }> {
  const res = await fetch(`${relay()}/api/images`, {
    method: "POST",
    headers: { ...uploaderHeaders(u), "content-type": "image/jpeg" },
    body: new Uint8Array(jpeg),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string; error?: string };
  if (!res.ok || !json.url || !json.expiresAt) throw new Error(`Image upload failed: ${json.error ?? res.status}`);
  return { url: json.url, expiresAt: json.expiresAt };
}

/** Removes a post image from the relay once Instagram has fetched it. */
export async function deleteFromRelay(url: string, u: Uploader): Promise<void> {
  const res = await fetch(`${relay()}/api/images`, {
    method: "DELETE",
    headers: { ...uploaderHeaders(u), "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Image delete failed (${res.status})`);
}
