import { requireEnv } from "../env";
import { GRAPH } from "../../relay/lib/instagram";
import type { SealedSignIn } from "../../relay/lib/handlers";
import { unseal } from "../../relay/lib/seal";

// The app's half of Instagram sign-in. Meta only returns a sign-in to a
// registered https address, and the code exchange needs the app secret, so
// the Connect relay (relay/) does that part. The token comes back sealed with
// a key only this app holds.

const relay = () => requireEnv("RELAY_URL").replace(/\/$/, "");

/** What the Instagram card and Connect button say when this copy's relay isn't set up. */
export const INSTAGRAM_NOT_READY = "Instagram isn't ready on this copy yet.";

export type Readiness = { ready: true } | { ready: false; reason: string };
const READY_CACHE_MS = 60_000;
let readyCache: { at: number; value: Readiness } | null = null;

/**
 * Asks the relay's /api/health whether every setting it needs is there. The
 * technical reason is for the server log only; the clinician sees INSTAGRAM_NOT_READY.
 */
export async function instagramReadiness(fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<Readiness> {
  if (readyCache && now - readyCache.at < READY_CACHE_MS) return readyCache.value;
  const value = await (async (): Promise<Readiness> => {
    const url = process.env.RELAY_URL;
    if (!url) return { ready: false, reason: "RELAY_URL is not set in .env" };
    try {
      const res = await fetchImpl(`${url.replace(/\/$/, "")}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
      const json = (await res.json().catch(() => null)) as { ready?: boolean; checks?: Record<string, boolean> } | null;
      if (!res.ok || !json) return { ready: false, reason: `relay health answered HTTP ${res.status}` };
      if (json.ready) return { ready: true };
      const missing = Object.entries(json.checks ?? {}).filter(([, ok]) => !ok).map(([k]) => k);
      return { ready: false, reason: `relay is missing ${missing.join(", ") || "settings"}` };
    } catch (e) {
      return { ready: false, reason: `relay unreachable: ${e instanceof Error ? e.message : String(e)}` };
    }
  })();
  readyCache = { at: now, value };
  return value;
}

/** Tests only. */
export function resetInstagramReadiness() {
  readyCache = null;
}

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
