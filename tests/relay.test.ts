// The Connect relay (relay/), run without the network: Meta and Vercel Blob are fakes.
import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { begin, callback, IMAGE_TTL_MS, prune, uploadImage, type Blobs, type RelayEnv } from "../relay/lib/handlers";
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
    expect(token).toMatchObject({ accessToken: "IGtoken", username: "practiceos_" });
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
  function fakeBlobs(existing: { url: string; uploadedAt: Date }[] = []) {
    const deleted: string[] = [];
    const blobs: Blobs = {
      put: vi.fn(async (pathname: string) => ({ url: `https://blob.example/${pathname}` })),
      list: async () => existing,
      del: async (urls) => void deleted.push(...urls),
    };
    return { blobs, deleted };
  }
  const upload = (body: Uint8Array<ArrayBuffer>, auth?: string) =>
    new Request("https://relay.example.test/api/images", { method: "POST", body, headers: auth ? { authorization: auth } : {} });

  it("needs a working Instagram sign-in", async () => {
    const { blobs } = fakeBlobs();
    expect((await uploadImage(upload(jpeg), { whoAmI: vi.fn(), blobs, now })).status).toBe(401);
    const whoAmI = vi.fn(async () => {
      throw new Error("bad token");
    });
    expect((await uploadImage(upload(jpeg, "Bearer nope"), { whoAmI, blobs, now })).status).toBe(401);
  });

  it("takes only a JPEG, hosts it for an hour, and deletes older ones", async () => {
    const { blobs, deleted } = fakeBlobs([
      { url: "https://blob.example/posts/old.jpg", uploadedAt: new Date(now() - IMAGE_TTL_MS - 1) },
      { url: "https://blob.example/posts/new.jpg", uploadedAt: new Date(now() - 1000) },
    ]);
    const whoAmI = vi.fn(async () => ({ userId: "1", username: "practiceos_" }));
    expect((await uploadImage(upload(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), "Bearer ok"), { whoAmI, blobs, now })).status).toBe(415);
    const res = await uploadImage(upload(jpeg, "Bearer ok"), { whoAmI, blobs, now });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string; expiresAt: string };
    expect(body.url).toMatch(/^https:\/\/blob\.example\/posts\/[0-9a-f]{32}\.jpg$/);
    expect(Date.parse(body.expiresAt) - now()).toBe(IMAGE_TTL_MS);
    expect(deleted).toEqual(["https://blob.example/posts/old.jpg"]);
  });

  it("runs the cleanup cron only with Vercel's cron secret", async () => {
    const { blobs } = fakeBlobs();
    expect((await prune(new Request("https://r/api/prune"), env, { blobs, now })).status).toBe(401);
    expect((await prune(new Request("https://r/api/prune", { headers: { authorization: "Bearer cron-secret" } }), env, { blobs, now })).status).toBe(200);
  });
});
