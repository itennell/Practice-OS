import { del, list, put } from "@vercel/blob";
import { exchangeCode, whoAmI } from "./instagram";
import type { Outside, RelayEnv } from "./handlers";

// Reads the relay's settings from Vercel's environment and wires the real outside calls.

export function relayEnv(): RelayEnv {
  const need = (name: string) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is not set in the relay's Vercel settings.`);
    return value;
  };
  return {
    RELAY_URL: need("RELAY_URL"),
    RELAY_STATE_KEY: need("RELAY_STATE_KEY"),
    INSTAGRAM_APP_ID: need("INSTAGRAM_APP_ID"),
    INSTAGRAM_APP_SECRET: need("INSTAGRAM_APP_SECRET"),
    CRON_SECRET: process.env.CRON_SECRET,
  };
}

export const outside: Outside = {
  exchangeCode,
  whoAmI,
  now: () => Date.now(),
  blobs: {
    put: async (pathname, body) =>
      put(pathname, Buffer.from(body), { access: "public", addRandomSuffix: true, contentType: "image/jpeg" }),
    list: async (prefix) => (await list({ prefix })).blobs.map((b) => ({ url: b.url, uploadedAt: new Date(b.uploadedAt) })),
    del: async (urls) => del(urls),
  },
};
