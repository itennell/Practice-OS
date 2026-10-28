import { requireEnv } from "../env";
import { GRAPH, type InstagramToken } from "../../relay/lib/instagram";
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

export function openInstagramToken(sealed: string, key: Buffer, state: string): InstagramToken {
  return JSON.parse(unseal(sealed, key, `instagram-token:${state}`)) as InstagramToken;
}

/** Long-lived tokens last about 60 days and can be refreshed once they are a day old (Meta's docs, 2026-10-28). */
export async function refreshInstagram(accessToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const res = await fetch(`${GRAPH}/refresh_access_token?${new URLSearchParams({ grant_type: "ig_refresh_token", access_token: accessToken })}`);
  const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !json.access_token) throw new Error(`Instagram refresh failed (${res.status})`);
  return { accessToken: json.access_token, expiresIn: Number(json.expires_in) };
}

/** Puts a post image (JPEG, made with sharp) on the relay for one hour, for Instagram to fetch. */
export async function uploadToRelay(jpeg: Buffer, accessToken: string): Promise<{ url: string; expiresAt: string }> {
  const res = await fetch(`${relay()}/api/images`, {
    method: "POST",
    headers: { authorization: `Bearer ${accessToken}`, "content-type": "image/jpeg" },
    body: new Uint8Array(jpeg),
  });
  const json = (await res.json().catch(() => ({}))) as { url?: string; expiresAt?: string; error?: string };
  if (!res.ok || !json.url || !json.expiresAt) throw new Error(`Image upload failed: ${json.error ?? res.status}`);
  return { url: json.url, expiresAt: json.expiresAt };
}
