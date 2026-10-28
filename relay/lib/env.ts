import { del, list, put } from "@vercel/blob";
import sharp from "sharp";
import { exchangeCode } from "./instagram";
import { IMAGE_CACHE_SECONDS, type Outside, type RelayEnv } from "./handlers";

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
  inspectImage: async (body) => {
    const m = await sharp(Buffer.from(body)).metadata();
    return { format: m.format ?? "", width: m.width ?? 0, height: m.height ?? 0 };
  },
  now: () => Date.now(),
  blobs: {
    put: async (pathname, body) =>
      put(pathname, Buffer.from(body), { access: "public", addRandomSuffix: true, contentType: "image/jpeg", cacheControlMaxAge: IMAGE_CACHE_SECONDS }),
    list: async (prefix) => (await list({ prefix, limit: 1000 })).blobs.map((b) => ({ url: b.url, uploadedAt: new Date(b.uploadedAt) })),
    del: async (urls) => del(urls),
  },
};
