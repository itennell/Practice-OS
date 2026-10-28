// The desktop relay's Instagram routes (proposed to the desktop-app session on
// 2026-10-28). The relay is a small public web service; the app on her computer
// is not reachable from Meta, so Meta returns to the relay and the relay hands
// off to the app through a practiceos:// link.
//
//   GET  <RELAY>/oauth/instagram/callback?code&state
//        exchanges the code and the long-lived token with INSTAGRAM_APP_SECRET
//        (relay env only), keeps the result 5 minutes under a one-time handoff
//        id, then 302s to practiceos://connect/instagram?handoff=H&state=S
//   POST <RELAY>/oauth/instagram/redeem   {handoff, state} -> RedeemedToken (once)
//   POST <RELAY>/media     Bearer <IG token>, image/jpeg -> {url, expiresAt} (1 hour)
//   DELETE <RELAY>/media/<id>  Bearer <IG token>
//
// Electron opens the practiceos:// link as /api/connect/instagram/return.
import { randomBytes } from "node:crypto";
import { SCOPES, type Fetch } from "./graph";

export type RedeemedToken = {
  access_token: string;
  user_id: string;
  permissions: string[];
  /** Seconds until the long-lived token expires (about 60 days). */
  expires_in: number;
};

export type HostedImage = { id: string; url: string; expiresAt: string };

export class RelayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
  }
}

export function relayUrl(): string | null {
  const url = process.env.RELAY_URL?.trim();
  return url ? url.replace(/\/+$/, "") : null;
}

/** The redirect URL Isaiah pastes into the Meta app (App Dashboard > Instagram > Business login settings). */
export function redirectUri(base: string): string {
  return `${base}/oauth/instagram/callback`;
}

export function newState(): string {
  return randomBytes(32).toString("base64url");
}

export function authorizeUrl(opts: { appId: string; relay: string; state: string }): string {
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: opts.appId,
    redirect_uri: redirectUri(opts.relay),
    response_type: "code",
    scope: SCOPES.join(","),
    state: opts.state,
    // Only Instagram professional-account sign-in, no Facebook detour.
    enable_fb_login: "false",
  }).toString();
  return url.toString();
}

export class RelayClient {
  constructor(
    private readonly base: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async json<T>(res: Response, what: string): Promise<T> {
    const text = await res.text();
    if (!res.ok) throw new RelayError(`The relay could not ${what} (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status);
    return JSON.parse(text) as T;
  }

  async redeem(handoff: string, state: string): Promise<RedeemedToken> {
    const res = await this.fetchImpl(`${this.base}/oauth/instagram/redeem`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handoff, state }),
      signal: AbortSignal.timeout(15_000),
    });
    return this.json<RedeemedToken>(res, "finish the sign-in");
  }

  async uploadJpeg(jpeg: Buffer, token: string): Promise<HostedImage> {
    const res = await this.fetchImpl(`${this.base}/media`, {
      method: "POST",
      headers: { "content-type": "image/jpeg", authorization: `Bearer ${token}` },
      body: new Uint8Array(jpeg),
      signal: AbortSignal.timeout(60_000),
    });
    return this.json<HostedImage>(res, "host the image");
  }

  /** Best effort: the relay deletes it after an hour anyway. */
  async deleteImage(id: string, token: string): Promise<void> {
    await this.fetchImpl(`${this.base}/media/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => undefined);
  }
}
