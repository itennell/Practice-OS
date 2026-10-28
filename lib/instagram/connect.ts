import { timingSafeEqual } from "node:crypto";
import { authorizeUrl, newState, relayUrl } from "./relay";

// Sign-in states waiting for the relay's hand-off. In memory on purpose: one
// app on her computer starts and finishes the sign-in, and a state is good for
// 10 minutes and once only.
const TTL_MS = 10 * 60_000;
const pending = new Map<string, number>();

export type StartResult = { ok: true; url: string } | { ok: false; reason: string };

export function startInstagramSignIn(now = Date.now()): StartResult {
  const appId = process.env.INSTAGRAM_APP_ID?.trim();
  const relay = relayUrl();
  if (!appId || !relay) {
    return { ok: false, reason: "Instagram sign-in isn't switched on in this copy of Practice-OS yet." };
  }
  for (const [s, at] of pending) if (now - at > TTL_MS) pending.delete(s);
  const state = newState();
  pending.set(state, now);
  return { ok: true, url: authorizeUrl({ appId, relay, state }) };
}

/** True once for a state this app started in the last 10 minutes. */
export function takeState(state: string, now = Date.now()): boolean {
  for (const [s, at] of pending) {
    const a = Buffer.from(s);
    const b = Buffer.from(state);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      pending.delete(s);
      return now - at <= TTL_MS;
    }
  }
  return false;
}

/** Meta's error_reason, in plain words. */
export function signInErrorText(reason: string | null): string {
  if (reason === "user_denied") return "Instagram sign-in was cancelled. Nothing was connected.";
  return "Instagram didn't finish the sign-in. Try Connect again.";
}
