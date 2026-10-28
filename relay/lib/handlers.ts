import { randomBytes } from "node:crypto";
import { authorizeUrl, exchangeCode, whoAmI, type InstagramToken } from "./instagram";
import { isAllowedReturn, seal, unseal } from "./seal";

// The Practice-OS Connect relay. It holds no database and logs no tokens. It
// does three things:
//   1. Instagram sign-in: the app asks to begin, Meta sends the clinician back
//      here, the relay swaps the code for a token, seals it with the app's
//      one-time key and sends the browser back to the app.
//   2. Post images: Instagram fetches each image from a public address. The
//      app uploads the JPEG here, and it is deleted after an hour.
//   3. A cron that deletes any image older than an hour.
// Handlers take their settings and outside calls as arguments so tests run them
// without the network (tests/relay.test.ts).

export type RelayEnv = {
  RELAY_URL: string; // this relay's own https address
  RELAY_STATE_KEY: string; // 32 bytes, base64
  INSTAGRAM_APP_ID: string;
  INSTAGRAM_APP_SECRET: string;
  CRON_SECRET?: string;
};

export type Blobs = {
  put(pathname: string, body: Uint8Array): Promise<{ url: string }>;
  list(prefix: string): Promise<{ url: string; uploadedAt: Date }[]>;
  del(urls: string[]): Promise<void>;
};

export type Outside = {
  exchangeCode: typeof exchangeCode;
  whoAmI: typeof whoAmI;
  blobs: Blobs;
  now: () => number;
};

const STATE_TTL_MS = 10 * 60_000;
export const IMAGE_TTL_MS = 60 * 60_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const callbackUrl = (env: RelayEnv) => `${env.RELAY_URL.replace(/\/$/, "")}/api/connect/instagram/callback`;
const stateKey = (env: RelayEnv) => Buffer.from(env.RELAY_STATE_KEY, "base64");
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

type RelayState = { returnTo: string; key: string; state: string; exp: number };

/** POST {returnTo, key, state}: the app starts an Instagram sign-in. Server to server, so the key never sits in a URL. */
export async function begin(request: Request, env: RelayEnv, outside: Pick<Outside, "now">): Promise<Response> {
  const body = (await request.json().catch(() => null)) as Partial<RelayState> | null;
  if (!body || typeof body.returnTo !== "string" || typeof body.key !== "string" || typeof body.state !== "string") {
    return jsonResponse({ error: "returnTo, key and state are required" }, 400);
  }
  if (!isAllowedReturn(body.returnTo)) return jsonResponse({ error: "returnTo must be the Practice-OS app on this computer" }, 400);
  if (Buffer.from(body.key, "base64").length !== 32 || body.state.length < 32) return jsonResponse({ error: "bad key or state" }, 400);
  const sealed = seal(
    JSON.stringify({ returnTo: body.returnTo, key: body.key, state: body.state, exp: outside.now() + STATE_TTL_MS } satisfies RelayState),
    stateKey(env),
    "relay-state",
  );
  return jsonResponse({ authUrl: authorizeUrl(env.INSTAGRAM_APP_ID, callbackUrl(env), sealed) });
}

function back(returnTo: string, params: Record<string, string>): Response {
  const url = new URL(returnTo);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { location: url.toString(), "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}

/** GET ?code&state from Meta: swap the code, seal the token for the app, send the browser back. */
export async function callback(request: Request, env: RelayEnv, outside: Pick<Outside, "exchangeCode" | "now">): Promise<Response> {
  const params = new URL(request.url).searchParams;
  let st: RelayState;
  try {
    st = JSON.parse(unseal(params.get("state") ?? "", stateKey(env), "relay-state")) as RelayState;
  } catch {
    return new Response("This sign-in link isn't valid. Start again from Practice-OS.", { status: 400 });
  }
  if (outside.now() > st.exp || !isAllowedReturn(st.returnTo)) {
    return new Response("This sign-in took too long. Start again from Practice-OS.", { status: 400 });
  }
  const code = params.get("code");
  if (!code) return back(st.returnTo, { state: st.state, error: params.get("error_reason") ?? params.get("error") ?? "denied" });
  let token: InstagramToken;
  try {
    token = await outside.exchangeCode(code, env.INSTAGRAM_APP_ID, env.INSTAGRAM_APP_SECRET, callbackUrl(env));
  } catch {
    return back(st.returnTo, { state: st.state, error: "exchange_failed" });
  }
  const sealed = seal(JSON.stringify(token), Buffer.from(st.key, "base64"), `instagram-token:${st.state}`);
  return back(st.returnTo, { state: st.state, sealed });
}

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;

async function deleteOld(blobs: Blobs, now: number): Promise<number> {
  const old = (await blobs.list("posts/")).filter((b) => now - b.uploadedAt.getTime() > IMAGE_TTL_MS).map((b) => b.url);
  if (old.length > 0) await blobs.del(old);
  return old.length;
}

/** POST a JPEG with "Authorization: Bearer <her Instagram token>": public for one hour. */
export async function uploadImage(request: Request, outside: Pick<Outside, "whoAmI" | "blobs" | "now">): Promise<Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return jsonResponse({ error: "sign in to Instagram first" }, 401);
  try {
    await outside.whoAmI(token); // only a connected Instagram account may host an image
  } catch {
    return jsonResponse({ error: "that Instagram sign-in isn't valid" }, 401);
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) return jsonResponse({ error: "image is over 8 MB" }, 413);
  if (!isJpeg(body)) return jsonResponse({ error: "Instagram needs a JPEG" }, 415);
  const { url } = await outside.blobs.put(`posts/${randomBytes(16).toString("hex")}.jpg`, body);
  await deleteOld(outside.blobs, outside.now());
  return jsonResponse({ url, expiresAt: new Date(outside.now() + IMAGE_TTL_MS).toISOString() });
}

/** Vercel cron: delete images older than an hour. */
export async function prune(request: Request, env: RelayEnv, outside: Pick<Outside, "blobs" | "now">): Promise<Response> {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return jsonResponse({ error: "unauthorized" }, 401);
  return jsonResponse({ deleted: await deleteOld(outside.blobs, outside.now()) });
}
