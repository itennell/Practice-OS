// The Connect relay (relay/), run without the network: Meta and Vercel Blob are fakes.
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { begin, callback, deleteImage, IMAGE_TTL_MS, MAX_IMAGE_BYTES, prune, uploadImage, uploadKeyFor, UPLOADS_PER_HOUR, type Blobs, type RelayEnv } from "../relay/lib/handlers";
import { isAllowedReturn, seal, unseal } from "../relay/lib/seal";
import { reencodeImage } from "../relay/lib/image";
import sharp from "sharp";

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
  const jpegInfo = async (body: Uint8Array) => ({ format: "jpeg", width: 1080, height: 1350, jpeg: body });
  function fakeBlobs(existing: { url: string; uploadedAt: Date }[] = []) {
    const deleted: string[] = [];
    const put = vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}` }));
    const live = [...existing];
    const blobs: Blobs = {
      put: async (pathname, body, contentType) => {
        const made = await put(pathname, body, contentType);
        live.push({ url: made.url, uploadedAt: new Date(now()) });
        return made;
      },
      list: async (prefix) => live.filter((b) => new URL(b.url).pathname.slice(1).startsWith(prefix)),
      del: async (urls) => {
        deleted.push(...urls);
        for (const u of urls) live.splice(live.findIndex((b) => b.url === u), 1);
      },
    };
    return { blobs, deleted, put };
  }
  const as = (userId: string, key = uploadKeyFor(env, userId)) => ({ authorization: `Bearer ${key}`, "x-instagram-user": userId });
  const upload = (body: Uint8Array<ArrayBuffer>, headers: Record<string, string> = {}) =>
    new Request("https://relay.example.test/api/images", { method: "POST", body, headers: { "content-length": String(body.length), ...headers } });

  it("needs the upload key this relay issued for that account", async () => {
    const { blobs } = fakeBlobs();
    const outside = { reencodeImage: jpegInfo, blobs, now };
    expect((await uploadImage(upload(jpeg), env, outside)).status).toBe(401);
    // Any other Instagram token, or a key for someone else, gets nothing.
    expect((await uploadImage(upload(jpeg, as("17841", "IGAAsomeoneElsesToken")), env, outside)).status).toBe(401);
    expect((await uploadImage(upload(jpeg, { ...as("999"), "x-instagram-user": "17841" }), env, outside)).status).toBe(401);
    expect((await uploadImage(upload(jpeg, as("17841")), env, outside)).status).toBe(200);
  });

  it("checks size before reading, and decodes the image instead of trusting its first bytes", async () => {
    const { blobs, put } = fakeBlobs();
    const big = new Request("https://relay.example.test/api/images", { method: "POST", body: jpeg, headers: { ...as("17841"), "content-length": String(MAX_IMAGE_BYTES + 1) } });
    expect((await uploadImage(big, env, { reencodeImage: jpegInfo, blobs, now })).status).toBe(413);
    const notAnImage = async () => {
      throw new Error("Input buffer contains unsupported image format");
    };
    expect((await uploadImage(upload(jpeg, as("17841")), env, { reencodeImage: notAnImage, blobs, now })).status).toBe(415);
    const png = async (body: Uint8Array) => ({ format: "png", width: 10, height: 10, jpeg: body });
    expect((await uploadImage(upload(jpeg, as("17841")), env, { reencodeImage: png, blobs, now })).status).toBe(415);
    expect(put).not.toHaveBeenCalled();
    // No Content-Length: refused before reading.
    const unsized = new Request("https://relay.example.test/api/images", { method: "POST", body: jpeg, headers: as("17841") });
    unsized.headers.delete("content-length");
    expect((await uploadImage(unsized, env, { reencodeImage: jpegInfo, blobs, now })).status).toBe(411);
  });

  it("stores a freshly encoded JPEG, so bytes hidden after the image never get hosted", async () => {
    const real = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#5b47c9" } }).jpeg().toBuffer();
    const smuggled = new Uint8Array(Buffer.concat([real, Buffer.from("<script>not an image</script>")]));
    const { blobs, put } = fakeBlobs();
    expect((await uploadImage(upload(smuggled, as("17841")), env, { reencodeImage, blobs, now })).status).toBe(200);
    const stored = Buffer.from(put.mock.calls.find(([p]) => p.endsWith(".jpg"))![1]);
    expect(stored.includes("<script>")).toBe(false);
    expect((await sharp(stored).metadata()).format).toBe("jpeg");
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: "#000" } }).png().toBuffer();
    expect((await uploadImage(upload(new Uint8Array(png), as("17841")), env, { reencodeImage, blobs, now })).status).toBe(415);
  });

  it("counts images the app already deleted toward the hourly limit", async () => {
    const { blobs } = fakeBlobs();
    const outside = { reencodeImage: jpegInfo, blobs, now };
    for (let i = 0; i < UPLOADS_PER_HOUR; i++) {
      const made = (await (await uploadImage(upload(jpeg, as("17841")), env, outside)).json()) as { url: string };
      const res = await deleteImage(new Request("https://r/api/images", { method: "DELETE", headers: as("17841"), body: JSON.stringify({ url: made.url }) }), env, outside);
      expect(res.status).toBe(200);
    }
    expect((await uploadImage(upload(jpeg, as("17841")), env, outside)).status).toBe(429);
  });

  it("files images per account, expires them in an hour, deletes old ones and limits uploads", async () => {
    const { blobs, deleted } = fakeBlobs();
    const res = await uploadImage(upload(jpeg, as("17841")), env, { reencodeImage: jpegInfo, blobs, now });
    const body = (await res.json()) as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https:\/\/blob\.example\/posts\/[A-Za-z0-9_-]{22}\/[0-9a-f]{32}\.jpg$/);
    expect(body.url).not.toContain("17841");
    expect(Date.parse(body.expiresAt) - now()).toBe(IMAGE_TTL_MS);
    const folder = new URL(body.url).pathname.slice(1).split("/").slice(0, 2).join("/");

    const marks = folder.replace(/^posts\//, "marks/");
    const old = { url: `https://blob.example/${folder}/old.jpg`, uploadedAt: new Date(now() - IMAGE_TTL_MS - 1) };
    const recent = Array.from({ length: UPLOADS_PER_HOUR }, (_, i) => ({ url: `https://blob.example/${marks}/r${i}`, uploadedAt: new Date(now() - 1000) }));
    const busy = fakeBlobs([old, ...recent]);
    expect((await uploadImage(upload(jpeg, as("17841")), env, { reencodeImage: jpegInfo, blobs: busy.blobs, now })).status).toBe(429);
    expect(busy.deleted).toEqual([old.url]);
    expect(deleted).toEqual([]);
  });

  it("lets the app delete its own image once Instagram has it, and nobody else's", async () => {
    const { blobs } = fakeBlobs();
    const made = (await (await uploadImage(upload(jpeg, as("17841")), env, { reencodeImage: jpegInfo, blobs, now })).json()) as { url: string };
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
