// Public website-chat limits. IPs exist only in this process's short-lived
// memory and are never saved. The database-backed daily caps survive restarts.
const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;
const MAX_KEYS = 5_000;
const hits = new Map<string, number[]>();

export const WEB_CHAT_POSTS_PER_MINUTE = 12;
export const WEB_CHAT_READS_PER_MINUTE = 60;
/** One visitor's share of the day, so a single address can't use up the practice-wide daily cap. */
export const WEB_CHAT_POSTS_PER_IP_PER_DAY = 60;
/** A POST body over this is refused before it is parsed (a message is at most 1,000 characters). */
export const WEB_CHAT_MAX_BODY_BYTES = 16 * 1024;

type Incoming = { headers: { get(name: string): string | null } };

/**
 * The visitor's address as the platform saw it. Vercel sets x-real-ip itself
 * (and overwrites any copy the visitor sends); the leftmost x-forwarded-for is
 * whatever the visitor wrote, so it is never used. Locally there is no proxy and
 * every request is this computer (Next 15 removed request.ip).
 */
export function webChatClientIp(request: Incoming): string {
  return request.headers.get("x-real-ip")?.trim() || "local";
}

export function allowWebChat(key: string, max: number, now = Date.now(), windowMs = MINUTE_MS): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < windowMs);
  const allowed = recent.length < max;
  if (allowed) recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!);
  return allowed;
}

/** Whether `key` still has room, without using any of it. */
export function hasRoom(key: string, max: number, now = Date.now(), windowMs = MINUTE_MS): boolean {
  return (hits.get(key) ?? []).filter((at) => now - at < windowMs).length < max;
}

export function resetWebChatRateLimit(): void {
  hits.clear();
}
