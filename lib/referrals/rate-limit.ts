// A small per-IP limit for the routes that call outside services (the map's
// search and Add to board). Only on the Vercel copy, where anyone with the demo
// password can reach them; her own computer has one user. In memory: a server
// restart forgets it, which is fine for a polite limit.
const WINDOW_MS = 60_000;
const MAX_KEYS = 5000;
const hits = new Map<string, number[]>();

/** The caller's IP as Vercel passes it (first x-forwarded-for hop). */
export function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
}

/** True when this key has asked fewer than `max` times in the last minute (and counts this one). */
export function allow(key: string, max: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  const ok = recent.length < max;
  if (ok) recent.push(now);
  hits.delete(key);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) hits.delete(hits.keys().next().value!);
  return ok;
}

export function resetRateLimit() {
  hits.clear();
}

/** On the Vercel copy, a 429 in plain words once an IP passes `max` a minute; null otherwise. */
export function limited(request: Request, route: string, max: number): Response | null {
  if (!process.env.VERCEL) return null;
  if (allow(`${route}|${clientIp(request)}`, max)) return null;
  return Response.json({ error: "That's a lot of searches in a minute. Wait a minute and try again." }, { status: 429 });
}
