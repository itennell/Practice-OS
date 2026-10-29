// What GET /api/health reports: which settings the relay has, as yes/no only,
// never a value. `ready` means sign-in can work, which needs only the four
// sign-in settings; `images` says whether post images can be hosted (the Blob
// store and the cleanup cron). The app asks this before offering Connect
// Instagram, and an upload without image hosting gets a plain 503.

export const SIGN_IN_SETTINGS = ["RELAY_URL", "RELAY_STATE_KEY", "INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"] as const;
export const IMAGE_SETTINGS = ["BLOB_READ_WRITE_TOKEN", "CRON_SECRET"] as const;
export type RelaySetting = (typeof SIGN_IN_SETTINGS)[number] | (typeof IMAGE_SETTINGS)[number];
export type RelayHealth = {
  ok: true;
  service: "practice-os-relay";
  ready: boolean;
  images: boolean;
  signIn: RelaySetting[];
  checks: Record<RelaySetting, boolean>;
};

/** The error an image upload or delete gets when the relay can't host images. */
export const IMAGES_NOT_SET_UP = "image hosting is not set up on the relay";

/**
 * The relay's own address: RELAY_URL when set, otherwise the production
 * address Vercel gives every project (VERCEL_PROJECT_PRODUCTION_URL), so a
 * relay made with the Deploy button works without typing its own address.
 */
export function ownRelayUrl(env: Record<string, string | undefined>): string | undefined {
  if (env.RELAY_URL) return env.RELAY_URL;
  return env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined;
}

export function relayHealth(raw: Record<string, string | undefined>): RelayHealth {
  const env: Record<string, string | undefined> = { ...raw, RELAY_URL: ownRelayUrl(raw) };
  const all = [...SIGN_IN_SETTINGS, ...IMAGE_SETTINGS];
  const checks = Object.fromEntries(all.map((k) => [k, Boolean(env[k])])) as Record<RelaySetting, boolean>;
  // A 32-byte state key; anything else fails every sign-in.
  if (checks.RELAY_STATE_KEY) checks.RELAY_STATE_KEY = Buffer.from(env.RELAY_STATE_KEY!, "base64").length === 32;
  if (checks.RELAY_URL) checks.RELAY_URL = /^https:\/\//.test(env.RELAY_URL!);
  return {
    ok: true,
    service: "practice-os-relay",
    ready: SIGN_IN_SETTINGS.every((k) => checks[k]),
    images: IMAGE_SETTINGS.every((k) => checks[k]),
    signIn: [...SIGN_IN_SETTINGS],
    checks,
  };
}
