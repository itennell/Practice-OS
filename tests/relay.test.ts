// The Connect relay (relay/), run without the network: Meta and Vercel Blob are fakes.
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { begin, callback, deleteImage, IMAGE_TTL_MS, MAX_IMAGE_BYTES, prune, uploadImage, uploadKeyFor, UPLOADS_PER_HOUR, type Blobs, type RelayEnv } from "../relay/lib/handlers";
import { isAllowedReturn, seal, unseal } from "../relay/lib/seal";

const env: RelayEnv = {
  RELAY_URL: "https://relay.example.test",
  RELAY_STATE_KEY: randomBytes(32).toString("base64"),
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "app-secret",
  CRON_SECRET: "cron-secret",
};
const now = () => 1_800_000_000_000;
const appKey = randomBytes(32);
const appState = randomBytes(32).toString("base64url");
const post = (body: unknown) => new Request("https://relay.example.test/api/connect/instagram/begin", { method: "POST", body: JSON.stringify(body) });

async function beginOk(returnTo = "http://127.0.0.1:3000/api/connect/instagram/return") {
  const res = await begin(post({ returnTo, key: appKey.toString("base64"), state: appState }), env, { now });
  expect(res.status).toBe(200);
  const { authUrl } = (await res.json()) as { authUrl: string };
  return new URL(authUrl);
}

describe("seal", () => {
  it("round-trips, and refuses a wrong key, context or tampered value", () => {
    const key = randomBytes(32);
    const sealed = seal("token-123", key, "ctx");
    expect(sealed).toMatch(/^v1\./);
    expect(unseal(sealed, key, "ctx")).toBe("token-123");
    expect(() => unseal(sealed, randomBytes(32), "ctx")).toThrow();
    expect(() => unseal(sealed, key, "other")).toThrow();
    expect(() => unseal(sealed.slice(0, -2) + "AA", key, "ctx")).toThrow();
  });

  it("only returns to the app on this computer", () => {
    expect(isAllowedReturn("practiceos://connect/instagram")).toBe(true);
    expect(isAllowedReturn("http://127.0.0.1:3000/api/connect/instagram/return")).toBe(true);
    expect(isAllowedReturn("http://localhost:4123/x")).toBe(true);
    expect(isAllowedReturn("https://evil.example/steal")).toBe(false);
    expect(isAllowedReturn("http://localhost.evil.example/")).toBe(false);
    expect(isAllowedReturn("http://user:pw@127.0.0.1/")).toBe(false);
    expect(isAllowedReturn("javascript:alert(1)")).toBe(false);
  });
});

describe("Instagram sign-in through the relay", () => {
  it("begins with Meta's own page, the registered callback and an opaque state", async () => {
    const url = await beginOk();
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("https://relay.example.test/api/connect/instagram/callback");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
    expect(url.searchParams.get("state")).not.toContain(appKey.toString("base64")); // the app's key never shows
  });

  it("refuses to begin for another website or a weak key", async () => {
    const bad = await begin(post({ returnTo: "https://evil.example/", key: appKey.toString("base64"), state: appState }), env, { now });
    expect(bad.status).toBe(400);
    const weak = await begin(post({ returnTo: "http://127.0.0.1:3000/x", key: "short", state: appState }), env, { now });
    expect(weak.status).toBe(400);
  });

  it("swaps the code and sends back a token only the app's key opens", async () => {
    const state = (await beginOk()).searchParams.get("state")!;
    const exchangeCode = vi.fn(async () => ({ accessToken: "IGtoken", expiresIn: 5_183_944, userId: "17841", username: "practiceos_", scopes: ["instagram_business_basic"] }));
    const res = await callback(new Request(`https://relay.example.test/api/connect/instagram/callback?code=abc%23_&state=${encodeURIComponent(state)}`), env, { exchangeCode, now });
    expect(res.status).toBe(302);
    expect(exchangeCode).toHaveBeenCalledWith("abc#_", "123", "app-secret", "https://relay.example.test/api/connect/instagram/callback");
    const back = new URL(res.headers.get("location")!);
    expect(back.origin).toBe("http://127.0.0.1:3000");
    expect(back.searchParams.get("state")).toBe(appState);
    expect(back.toString()).not.toContain("IGtoken");
    const token = JSON.parse(unseal(back.searchParams.get("sealed")!, appKey, `instagram-token:${appState}`));
    expect(token).toMatchObject({ accessToken: "IGtoken", username: "practiceos_", uploadKey: uploadKeyFor(env, "17841") });
  });

  it("passes a cancelled sign-in back as an error, and refuses an old or forged state", async () => {
    const state = (await beginOk()).searchParams.get("state")!;
    const exchangeCode = vi.fn();
    const cancelled = await callback(new Request(`https://r/cb?error=access_denied&error_reason=user_denied&state=${encodeURIComponent(state)}`), env, { exchangeCode, now });
    expect(new URL(cancelled.headers.get("location")!).searchParams.get("error")).toBe("user_denied");

    const late = await callback(new Request(`https://r/cb?code=x&state=${encodeURIComponent(state)}`), env, { exchangeCode, now: () => now() + 11 * 60_000 });
    expect(late.status).toBe(400);
    const forged = seal(JSON.stringify({ returnTo: "https://evil.example/", key: appKey.toString("base64"), state: appState, exp: now() + 1000 }), randomBytes(32), "relay-state");
    const refused = await callback(new Request(`https://r/cb?code=x&state=${encodeURIComponent(forged)}`), env, { exchangeCode, now });
    expect(refused.status).toBe(400);
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});

describe("post images", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const jpegInfo = async () => ({ format: "jpeg", width: 1080, height: 1350 });
  function fakeBlobs(existing: { url: string; uploadedAt: Date }[] = []) {
    const deleted: string[] = [];
    const put = vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}` }));
    const blobs: Blobs = { put, list: async (prefix) => existing.filter((b) => new URL(b.url).pathname.slice(1).startsWith(prefix)), del: async (urls) => void deleted.push(...urls) };
    return { blobs, deleted, put };
  }
  const as = (userId: string, key = uploadKeyFor(env, userId)) => ({ authorization: `Bearer ${key}`, "x-instagram-user": userId });
  const upload = (body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
    new Request("https://relay.example.test/api/images", { method: "POST", body, headers: { "content-length": String(body.length), ...headers } });

  it("needs the upload key this relay issued for that account", async () => {
    const { blobs } = fakeBlobs();
    const outside = { inspectImage: jpegInfo, blobs, now };
    expect((await uploadImage(upload(jpeg), env, outside)).status).toBe(401);
    // Any other Instagram token, or a key for someone else, gets nothing.
    expect((await uploadImage(upload(jpeg, as("17841", "IGAAsomeoneElsesToken")), env, outside)).status).toBe(401);
    expect((await uploadImage(upload(jpeg, { ...as("999"), "x-instagram-user": "17841" }), env, outside)).status).toBe(401);
    expect((await uploadImage(upload(jpeg, as("17841")), env, outside)).status).toBe(200);
  });

  it("checks size before reading, and decodes the image instead of trusting its first bytes", async () => {
    const { blobs, put } = fakeBlobs();
    const big = new Request("https://relay.example.test/api/images", { method: "POST", body: jpeg, headers: { ...as("17841"), "content-length": String(MAX_IMAGE_BYTES + 1) } });
    expect((await uploadImage(big, env, { inspectImage: jpegInfo, blobs, now })).status).toBe(413);
    const notAnImage = async () => {
      throw new Error("Input buffer contains unsupported image format");
    };
    expect((await uploadImage(upload(jpeg, as("17841")), env, { inspectImage: notAnImage, blobs, now })).status).toBe(415);
    const png = async () => ({ format: "png", width: 10, height: 10 });
    expect((await uploadImage(upload(jpeg, as("17841")), env, { inspectImage: png, blobs, now })).status).toBe(415);
    expect(put).not.toHaveBeenCalled();
  });

  it("files images per account, expires them in an hour, deletes old ones and limits uploads", async () => {
    const { blobs, deleted } = fakeBlobs();
    const res = await uploadImage(upload(jpeg, as("17841")), env, { inspectImage: jpegInfo, blobs, now });
    const body = (await res.json()) as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https:\/\/blob\.example\/posts\/[A-Za-z0-9_-]{22}\/[0-9a-f]{32}\.jpg$/);
    expect(body.url).not.toContain("17841");
    expect(Date.parse(body.expiresAt) - now()).toBe(IMAGE_TTL_MS);
    const folder = new URL(body.url).pathname.slice(1).split("/").slice(0, 2).join("/");

    const old = { url: `https://blob.example/${folder}/old.jpg`, uploadedAt: new Date(now() - IMAGE_TTL_MS - 1) };
    const recent = Array.from({ length: UPLOADS_PER_HOUR }, (_, i) => ({ url: `https://blob.example/${folder}/r${i}.jpg`, uploadedAt: new Date(now() - 1000) }));
    const busy = fakeBlobs([old, ...recent]);
    expect((await uploadImage(upload(jpeg, as("17841")), env, { inspectImage: jpegInfo, blobs: busy.blobs, now })).status).toBe(429);
    expect(busy.deleted).toEqual([old.url]);
    expect(deleted).toEqual([]);
  });

  it("lets the app delete its own image once Instagram has it, and nobody else's", async () => {
    const { blobs } = fakeBlobs();
    const made = (await (await uploadImage(upload(jpeg, as("17841")), env, { inspectImage: jpegInfo, blobs, now })).json()) as { url: string };
    const del = (headers: Record<string, string>, url: string) =>
      deleteImage(new Request("https://r/api/images", { method: "DELETE", headers, body: JSON.stringify({ url }) }), env, { blobs: fake.blobs });
    const fake = fakeBlobs();
    expect((await del(as("555"), made.url)).status).toBe(403);
    expect((await del({}, made.url)).status).toBe(401);
    expect((await del(as("17841"), made.url)).status).toBe(200);
    expect(fake.deleted).toEqual([made.url]);
  });

  it("runs the cleanup cron only with Vercel's cron secret", async () => {
    const { blobs } = fakeBlobs();
    expect((await prune(new Request("https://r/api/prune"), env, { blobs, now })).status).toBe(401);
    expect((await prune(new Request("https://r/api/prune", { headers: { authorization: "Bearer cron-secret" } }), env, { blobs, now })).status).toBe(200);
  });
});
