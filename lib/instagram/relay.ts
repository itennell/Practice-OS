// What the Instagram helper needs from the desktop app's Connect layer
// (connect interface v0, owned by the desktop-app session):
//   getAccessToken("instagram", scopes) -> the stored token, refreshed when needed
//   uploadPostImage(jpeg)               -> {url, expiresAt}, public for 1 hour
// Sign-in itself (start, the relay's code exchange, redeem by state) is all
// lib/connect's. Until lib/connect lands on main, this file is the stand-in:
// it reads the token through lib/connections.ts and posts to the relay's
// POST /images. Once lib/connect exists, the bodies below become re-exports.
import { randomUUID } from "node:crypto";
import { getConnection } from "../connections";
import { SCOPES, type Fetch } from "./graph";

export type HostedImage = { url: string; expiresAt: string };

/** Thrown when Instagram isn't connected or lacks a scope; the page shows Connect. */
export class NeedsConnectError extends Error {
  constructor(readonly missingScopes: string[]) {
    super("Connect Instagram first: Settings › Connections › Instagram.");
  }
}

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

/** The redirect URL Isaiah pastes into the Meta app (Business login settings). */
export function redirectUri(base: string): string {
  return `${base}/connect/instagram/callback`;
}

export async function getInstagramToken(): Promise<string> {
  const c = await getConnection("instagram");
  if (!c?.accessToken) throw new NeedsConnectError([...SCOPES]);
  const missing = SCOPES.filter((s) => !c.scopes.includes(s));
  if (missing.length) throw new NeedsConnectError(missing);
  if (c.expiresAt && c.expiresAt.getTime() <= Date.now()) throw new NeedsConnectError([]);
  return c.accessToken;
}

export async function uploadPostImage(jpeg: Buffer, fetchImpl: Fetch = fetch): Promise<HostedImage> {
  const base = relayUrl();
  if (!base) throw new RelayError("Instagram pictures need the Practice-OS relay, and it isn't set up yet.", null);
  const res = await fetchImpl(`${base}/images`, {
    method: "POST",
    headers: { "content-type": "image/jpeg", "x-install-id": process.env.PRACTICEOS_INSTALL_ID ?? randomUUID() },
    body: new Uint8Array(jpeg),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new RelayError(`The relay could not host the picture (HTTP ${res.status}): ${text.slice(0, 200)}`, res.status);
  return JSON.parse(text) as HostedImage;
}
