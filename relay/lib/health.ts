// What GET /api/health reports: which settings the relay has, as yes/no only,
// never a value. The app asks this before showing the Instagram Connect button,
// so a copy whose relay isn't set up says so plainly instead of failing on click.

export const RELAY_SETTINGS = ["RELAY_URL", "RELAY_STATE_KEY", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET", "CRON_SECRET", "BLOB_READ_WRITE_TOKEN"] as const;
export type RelaySetting = (typeof RELAY_SETTINGS)[number];
export type RelayHealth = { ok: true; service: "practice-os-relay"; ready: boolean; checks: Record<RelaySetting, boolean> };

export function relayHealth(env: Record<string, string | undefined>): RelayHealth {
  const checks = Object.fromEntries(RELAY_SETTINGS.map((k) => [k, Boolean(env[k])])) as Record<RelaySetting, boolean>;
  // A 32-byte state key; anything else fails every sign-in.
  if (checks.RELAY_STATE_KEY) checks.RELAY_STATE_KEY = Buffer.from(env.RELAY_STATE_KEY!, "base64").length === 32;
  if (checks.RELAY_URL) checks.RELAY_URL = /^https:\/\//.test(env.RELAY_URL!);
  return { ok: true, service: "practice-os-relay", ready: Object.values(checks).every(Boolean), checks };
}
