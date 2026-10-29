import type { RelayFacts } from "./doctor";

// Asks a relay's GET /api/health (relay/lib/health.ts) for its yes/no settings.
// Used by `npm run doctor` and the guided Instagram card. The answer holds no
// values, only whether each setting is there.

export async function askRelayHealth(url: string | undefined, fetchImpl: typeof fetch = fetch): Promise<RelayFacts> {
  const base = url?.trim().replace(/\/$/, "");
  if (!base) return { kind: "no-url" };
  if (!/^https:\/\//.test(base)) return { kind: "unreachable", reason: "the address must start with https://" };
  try {
    const res = await fetchImpl(`${base}/api/health`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    const json = (await res.json().catch(() => null)) as { service?: string; ready?: boolean; images?: boolean; checks?: Record<string, boolean> } | null;
    if (!res.ok || json?.service !== "practice-os-relay") return { kind: "unreachable", reason: `that address isn't a Practice-OS relay (HTTP ${res.status})` };
    return { kind: "answered", ready: Boolean(json.ready), images: Boolean(json.images), checks: json.checks ?? {} };
  } catch (e) {
    return { kind: "unreachable", reason: e instanceof Error ? e.message : String(e) };
  }
}
