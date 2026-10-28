import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authorizeUrl, exchangeCode, type InstagramToken } from "./instagram";
import { isAllowedReturn, seal, unseal } from "./seal";

// The Practice-OS Connect relay. It holds no database and logs no tokens. It
// does three things:
//   1. Instagram sign-in: the app asks to begin, Meta sends the clinician back
//      here, the relay swaps the code for a token, seals it with the app's
//      one-time key and sends the browser back to the app.
//   2. Post images: Instagram fetches each image from a public address. The
//      app uploads the JPEG here with an upload key the relay itself issued at
//      sign-in (an HMAC over her Instagram user id), at most 20 an hour. The
//      app deletes it once Instagram has it; otherwise it goes after an hour.
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
  /** Decodes the image (sharp on Vercel); throws if it isn't one. */
  inspectImage: (body: Uint8Array) => Promise<{ format: string; width: number; height: number }>;
  blobs: Blobs;
  now: () => number;
};

const STATE_TTL_MS = 10 * 60_000;
export const IMAGE_TTL_MS = 60 * 60_000;
// Vercel refuses request bodies over 4.5 MB; Instagram's own limit is 8 MB but the app sends about 200 KB.
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 8192;
export const UPLOADS_PER_HOUR = 20;
// The CDN may keep serving a deleted image this long, so keep it short.
export const IMAGE_CACHE_SECONDS = 600;

const callbackUrl = (env: RelayEnv) => `${env.RELAY_URL.replace(/\/$/, "")}/api/connect/instagram/callback`;
const stateKey = (env: RelayEnv) => Buffer.from(env.RELAY_STATE_KEY, "base64");
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

type RelayState = { returnTo: string; key: string; state: string; exp: number };

/** What the app opens after sign-in: the token, plus the key that lets it upload post images. */
export type SealedSignIn = InstagramToken & { uploadKey: string };

const hmac = (env: RelayEnv, purpose: string, userId: string) => createHmac("sha256", stateKey(env)).update(`${purpose}:${userId}`).digest("base64url");
/** Only the relay can make this: the app gets it once, sealed, at sign-in. */
export const uploadKeyFor = (env: RelayEnv, userId: string) => hmac(env, "upload", userId);
/** Images are filed under a per-account folder name that doesn't reveal the Instagram id. */
const folderFor = (env: RelayEnv, userId: string) => `posts/${hmac(env, "folder", userId).slice(0, 22)}/`;

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
  const signIn: SealedSignIn = { ...token, uploadKey: uploadKeyFor(env, token.userId) };
  const sealed = seal(JSON.stringify(signIn), Buffer.from(st.key, "base64"), `instagram-token:${st.state}`);
  return back(st.returnTo, { state: st.state, sealed });
}

async function deleteOld(blobs: Blobs, now: number, prefix = "posts/"): Promise<number> {
  const old = (await blobs.list(prefix)).filter((b) => now - b.uploadedAt.getTime() > IMAGE_TTL_MS).map((b) => b.url);
  if (old.length > 0) await blobs.del(old);
  return old.length;
}

/** The account an upload or delete is for, if its upload key is the one this relay issued. */
function uploader(request: Request, env: RelayEnv): string | null {
  const userId = request.headers.get("x-instagram-user") ?? "";
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  if (!/^\d{1,32}$/.test(userId) || given.length === 0) return null;
  const expected = Buffer.from(uploadKeyFor(env, userId));
  return given.length === expected.length && timingSafeEqual(given, expected) ? userId : null;
}

/**
 * POST a JPEG with "Authorization: Bearer <upload key>" and "X-Instagram-User: <id>".
 * Public for at most an hour (sooner once the app deletes it).
 */
export async function uploadImage(request: Request, env: RelayEnv, outside: Pick<Outside, "inspectImage" | "blobs" | "now">): Promise<Response> {
  const userId = uploader(request, env);
  if (!userId) return jsonResponse({ error: "connect Instagram in Practice-OS first" }, 401);
  // Check the declared size before reading the body.
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared <= 0) return jsonResponse({ error: "send the image size" }, 411);
  if (declared > MAX_IMAGE_BYTES) return jsonResponse({ error: "image is over 4 MB" }, 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.length > MAX_IMAGE_BYTES) return jsonResponse({ error: "image is over 4 MB" }, 413);
  const image = await outside.inspectImage(body).catch(() => null);
  if (!image || image.format !== "jpeg" || image.width > MAX_SIDE || image.height > MAX_SIDE) return jsonResponse({ error: "Instagram needs a JPEG" }, 415);

  const folder = folderFor(env, userId);
  const now = outside.now();
  await deleteOld(outside.blobs, now, folder);
  const recent = (await outside.blobs.list(folder)).filter((b) => now - b.uploadedAt.getTime() <= IMAGE_TTL_MS);
  if (recent.length >= UPLOADS_PER_HOUR) return jsonResponse({ error: "too many images this hour" }, 429);
  const { url } = await outside.blobs.put(`${folder}${randomBytes(16).toString("hex")}.jpg`, body);
  return jsonResponse({ url, expiresAt: new Date(now + IMAGE_TTL_MS).toISOString() });
}

/** DELETE {url}: the app removes an image as soon as Instagram has it. */
export async function deleteImage(request: Request, env: RelayEnv, outside: Pick<Outside, "blobs">): Promise<Response> {
  const userId = uploader(request, env);
  if (!userId) return jsonResponse({ error: "connect Instagram in Practice-OS first" }, 401);
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  let pathname = "";
  try {
    pathname = new URL(String(body?.url)).pathname.replace(/^\//, "");
  } catch {
    return jsonResponse({ error: "url is required" }, 400);
  }
  if (!pathname.startsWith(folderFor(env, userId))) return jsonResponse({ error: "not your image" }, 403);
  await outside.blobs.del([String(body!.url)]);
  return jsonResponse({ deleted: true });
}

/** Vercel cron: delete images older than an hour. */
export async function prune(request: Request, env: RelayEnv, outside: Pick<Outside, "blobs" | "now">): Promise<Response> {
  if (!env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) return jsonResponse({ error: "unauthorized" }, 401);
  return jsonResponse({ deleted: await deleteOld(outside.blobs, outside.now()) });
}
