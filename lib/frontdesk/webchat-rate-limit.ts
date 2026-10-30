// Public website-chat limits. IPs exist only in this process's short-lived
// memory and are never saved. The database-backed daily cap survives restarts.
const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
const hits = new Map<string, number[]>();

export const WEB_CHAT_POSTS_PER_MINUTE = 12;
export const WEB_CHAT_READS_PER_MINUTE = 60;

export function webChatClientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

export function allowWebChat(key: string, max: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  const allowed = recent.length < max;
  if (allowed) recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!);
  return allowed;
}

export function resetWebChatRateLimit(): void {
  hits.clear();
}
