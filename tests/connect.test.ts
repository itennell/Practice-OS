// Connect buttons end to end on the test database: the real lib/connect and the
// real relay code, with Google's and Meta's servers faked at fetch().
// Runs only when DATABASE_URL is set (npm test sets a throwaway one).
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { begin, callback, deleteImage, uploadImage, type Blobs, type RelayEnv } from "../relay/lib/handlers";
import { relayHealth } from "../relay/lib/health";

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;
const ORIGIN = "http://127.0.0.1:3000";
const relayEnv: RelayEnv = {
  RELAY_URL: "https://relay.example.test",
  RELAY_STATE_KEY: randomBytes(32).toString("base64"),
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "app-secret",
};

const saved = { ...process.env };
beforeAll(() => {
  process.env.GOOGLE_CLIENT_ID = "client-id.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "desktop-secret";
  process.env.RELAY_URL = relayEnv.RELAY_URL;
  process.env.CONNECTIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});
afterEach(async () => {
  vi.unstubAllGlobals();
  (await import("../lib/connect/instagram")).resetInstagramReadiness();
  if (sql) await sql`delete from practice_os.connections where provider in ('google', 'instagram', 'muse')`;
});
afterAll(async () => {
  process.env = saved;
  await sql?.end();
});

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
/** The relay's /api/health for a fully set-up relay. */
const readyHealth = () => jsonRes(relayHealth({ ...relayEnv, CRON_SECRET: "c", BLOB_READ_WRITE_TOKEN: "b" }));

describe.skipIf(!url)("Google Connect", () => {
  it("sends her to Google with PKCE and the loopback return, and saves the sign-in encrypted", async () => {
    const { startConnect, finishConnect, GOOGLE_SCOPES } = await import("../lib/connect");
    const { authUrl } = await startConnect("google", { scopes: [GOOGLE_SCOPES.gmailCompose], origin: ORIGIN });
    const auth = new URL(authUrl);
    expect(auth.origin).toBe("https://accounts.google.com");
    expect(auth.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/connect/google/return`);
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.get("scope")!.split(" ")).toEqual(["openid", "email", GOOGLE_SCOPES.gmailCompose]);
    const state = auth.searchParams.get("state")!;

    let sentVerifier = "";
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://oauth2.googleapis.com/token");
      const form = new URLSearchParams(String(init?.body));
      sentVerifier = form.get("code_verifier")!;
      expect(form.get("redirect_uri")).toBe(`${ORIGIN}/api/connect/google/return`);
      return jsonRes({ access_token: "ya29.access", refresh_token: "1//refresh", expires_in: 3599, scope: `openid email ${GOOGLE_SCOPES.gmailCompose}`, id_token: idToken("dana@example.com") });
    });
    const c = await finishConnect("google", new URLSearchParams({ state, code: "4/code" }));
    expect(createHash("sha256").update(sentVerifier).digest("base64url")).toBe(auth.searchParams.get("code_challenge"));
    expect(c.accountLabel).toBe("dana@example.com");

    const [row] = await sql!`select access_token_enc, refresh_token_enc from practice_os.connections where provider = 'google'`;
    expect(row.access_token_enc).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain("ya29.access");

    // The state was single use.
    await expect(finishConnect("google", new URLSearchParams({ state, code: "4/code" }))).rejects.toThrow(/expired or was already used/);
  });

  it("asks for what she already granted plus the new part, and says when a part is missing", async () => {
    const { startConnect, getAccessToken, NeedsConnectError, GOOGLE_SCOPES } = await import("../lib/connect");
    const { saveConnection } = await import("../lib/connections");
    await saveConnection({ provider: "google", accountLabel: "dana@example.com", accessToken: "a", refreshToken: "r", scopes: ["openid", "email", GOOGLE_SCOPES.gmailCompose], expiresAt: new Date(Date.now() + 3_600_000), meta: {} });
    const { authUrl } = await startConnect("google", { scopes: [GOOGLE_SCOPES.calendarEvents], origin: ORIGIN });
    expect(new URL(authUrl).searchParams.get("scope")!.split(" ")).toEqual(["openid", "email", GOOGLE_SCOPES.gmailCompose, GOOGLE_SCOPES.calendarEvents]);

    expect(await getAccessToken("google", [GOOGLE_SCOPES.gmailCompose])).toBe("a");

    // An older sign-in that somehow holds full Gmail never gets that asked for again.
    await saveConnection({ provider: "google", accountLabel: null, accessToken: "a", refreshToken: "r", scopes: ["openid", "email", "https://mail.google.com/", GOOGLE_SCOPES.gmailCompose], expiresAt: null, meta: {} });
    const again = new URL((await startConnect("google", { scopes: [], origin: ORIGIN })).authUrl).searchParams.get("scope")!.split(" ");
    expect(again).not.toContain("https://mail.google.com/");
    expect(again).toContain(GOOGLE_SCOPES.gmailCompose);
    await expect(getAccessToken("google", [GOOGLE_SCOPES.calendarEvents])).rejects.toBeInstanceOf(NeedsConnectError);
  });

  it("refreshes an expiring token, and asks to reconnect when Google refuses", async () => {
    const { getAccessToken, NeedsConnectError } = await import("../lib/connect");
    const { saveConnection } = await import("../lib/connections");
    await saveConnection({ provider: "google", accountLabel: null, accessToken: "old", refreshToken: "r", scopes: [], expiresAt: new Date(Date.now() + 10_000), meta: {} });
    vi.stubGlobal("fetch", async () => jsonRes({ access_token: "new", expires_in: 3599 }));
    expect(await getAccessToken("google")).toBe("new");
    expect(await getAccessToken("google")).toBe("new"); // saved, no second refresh needed

    await saveConnection({ provider: "google", accountLabel: null, accessToken: "old", refreshToken: "r", scopes: [], expiresAt: new Date(Date.now() - 1), meta: {} });
    vi.stubGlobal("fetch", async () => jsonRes({ error: "invalid_grant" }, 400));
    await expect(getAccessToken("google")).rejects.toBeInstanceOf(NeedsConnectError);
  });

  it("treats a network hiccup during refresh as temporary, not as 'connect again'", async () => {
    const { getAccessToken, ConnectUnavailableError } = await import("../lib/connect");
    const { saveConnection } = await import("../lib/connections");
    await saveConnection({ provider: "google", accountLabel: null, accessToken: "old", refreshToken: "r", scopes: [], expiresAt: new Date(Date.now() - 1), meta: {} });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await expect(getAccessToken("google")).rejects.toBeInstanceOf(ConnectUnavailableError);
    vi.stubGlobal("fetch", async () => jsonRes({ error: "internal_failure" }, 500));
    await expect(getAccessToken("google")).rejects.toBeInstanceOf(ConnectUnavailableError);
  });

  it("revokes the sign-in at Google on disconnect", async () => {
    const { disconnect } = await import("../lib/connect");
    const { saveConnection, getConnection } = await import("../lib/connections");
    await saveConnection({ provider: "google", accountLabel: null, accessToken: "a", refreshToken: "1//refresh", scopes: [], expiresAt: null, meta: {} });
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      calls.push(`${input} ${init?.body}`);
      return new Response(null, { status: 200 });
    });
    expect(await disconnect("google")).toMatchObject({ revoked: true });
    expect(calls).toEqual(["https://oauth2.googleapis.com/revoke token=1%2F%2Frefresh"]);
    expect(await getConnection("google")).toBeNull();
  });
});

describe.skipIf(!url)("Instagram Connect through the relay", () => {
  it("connects end to end and never stores or shows a plain token", async () => {
    const { startConnect, finishConnect, getAccessToken } = await import("../lib/connect");
    const { getConnectionStatus } = await import("../lib/connect/status");
    const exchangeCode = async () => ({ accessToken: "IGlong", expiresIn: 5_183_944, userId: "17841", username: "practiceos_", scopes: ["instagram_business_basic", "instagram_business_content_publish"] });

    // The app's server calls the relay's begin; route that to the real handler.
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      if (String(input).endsWith("/api/health")) return readyHealth();
      expect(String(input)).toBe("https://relay.example.test/api/connect/instagram/begin");
      return begin(new Request(String(input), init), relayEnv, { now: Date.now });
    });
    const { authUrl } = await startConnect("instagram", { origin: ORIGIN });
    const relayState = new URL(authUrl).searchParams.get("state")!;

    // Meta sends her browser to the relay's callback, which sends her back to the app.
    const res = await callback(new Request(`https://relay.example.test/api/connect/instagram/callback?code=c&state=${encodeURIComponent(relayState)}`), relayEnv, { exchangeCode, now: Date.now });
    const back = new URL(res.headers.get("location")!);
    expect(back.origin + back.pathname).toBe(`${ORIGIN}/api/connect/instagram/return`);

    const c = await finishConnect("instagram", back.searchParams);
    expect(c.accountLabel).toBe("@practiceos_");
    expect(await getAccessToken("instagram")).toBe("IGlong");
    const status = await getConnectionStatus("instagram");
    expect(status).toMatchObject({ provider: "instagram", connected: true, accountLabel: "@practiceos_" });
    expect(JSON.stringify(status)).not.toContain("IGlong");
    const [row] = await sql!`select access_token_enc from practice_os.connections where provider = 'instagram'`;
    expect(row.access_token_enc).not.toContain("IGlong");

    // Post images go up with the relay's own upload key, and come down once Instagram has them.
    const stored: string[] = [];
    const blobs: Blobs = { put: async (p) => (stored.push(p), { url: `https://blob.example/${p}` }), list: async () => [], del: async (urls) => void stored.splice(0, stored.length, ...stored.filter((p) => !urls.includes(`https://blob.example/${p}`))) };
    const relayOutside = { blobs, now: Date.now, reencodeImage: async (b: Uint8Array) => ({ format: "jpeg", width: 1080, height: 1080, jpeg: b }) };
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const r = new Request(String(input), { ...init, headers: { ...(init?.headers as Record<string, string>), "content-length": String((init?.body as Uint8Array | string)?.length ?? 0) } });
      return init?.method === "DELETE" ? deleteImage(r, relayEnv, relayOutside) : uploadImage(r, relayEnv, relayOutside);
    });
    const { uploadPostImage, deletePostImage } = await import("../lib/connect");
    const image = await uploadPostImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    expect(stored.filter((p) => p.endsWith(".jpg"))).toHaveLength(1);
    await deletePostImage(image.url);
    expect(stored.filter((p) => p.endsWith(".jpg"))).toHaveLength(0);
  });

  it("won't upload a post image for a sign-in that didn't allow publishing", async () => {
    const { uploadPostImage, NeedsConnectError } = await import("../lib/connect");
    const { saveConnection } = await import("../lib/connections");
    await saveConnection({ provider: "instagram", accountLabel: "@practiceos_", accessToken: "t", refreshToken: "k", scopes: ["instagram_business_basic"], expiresAt: new Date(Date.now() + 86_400_000), meta: { userId: "17841" } });
    await expect(uploadPostImage(Buffer.from([0xff, 0xd8, 0xff]))).rejects.toBeInstanceOf(NeedsConnectError);
  });

  it("records a cancelled sign-in and saves nothing", async () => {
    const { startConnect, finishConnect } = await import("../lib/connect");
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) =>
      String(input).endsWith("/api/health") ? readyHealth() : begin(new Request(String(input), init), relayEnv, { now: Date.now }),
    );
    const { authUrl } = await startConnect("instagram", { origin: ORIGIN });
    const res = await callback(
      new Request(`https://r/cb?error=access_denied&error_reason=user_denied&state=${encodeURIComponent(new URL(authUrl).searchParams.get("state")!)}`),
      relayEnv,
      { exchangeCode: vi.fn(), now: Date.now },
    );
    await expect(finishConnect("instagram", new URL(res.headers.get("location")!).searchParams)).rejects.toThrow(/cancelled/);
    const [{ n }] = await sql!`select count(*)::int as n from practice_os.connections where provider = 'instagram'`;
    expect(n).toBe(0);
  });
});

describe.skipIf(!url)("Her Muse key", () => {
  const before = { key: process.env.MODEL_API_KEY, source: process.env.MODEL_API_KEY_SOURCE };
  afterEach(() => {
    if (before.key) process.env.MODEL_API_KEY = before.key;
    else delete process.env.MODEL_API_KEY;
    if (before.source) process.env.MODEL_API_KEY_SOURCE = before.source;
    else delete process.env.MODEL_API_KEY_SOURCE;
  });

  it("is used at once when saved, and stops at once when removed", async () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY_SOURCE;
    const { saveMuseKey, removeMuseKey, loadMuseKey } = await import("../lib/connect/muse");
    expect(await saveMuseKey("saved-key-1234567890abcdef")).toEqual({ inUse: true });
    expect(process.env.MODEL_API_KEY).toBe("saved-key-1234567890abcdef");
    await removeMuseKey();
    expect(process.env.MODEL_API_KEY).toBeUndefined();
    await loadMuseKey();
    expect(process.env.MODEL_API_KEY).toBeUndefined();
  });

  it("never overrides or clears a key from .env", async () => {
    process.env.MODEL_API_KEY = "env-key";
    delete process.env.MODEL_API_KEY_SOURCE;
    const { saveMuseKey, removeMuseKey } = await import("../lib/connect/muse");
    expect(await saveMuseKey("saved-key-1234567890abcdef")).toEqual({ inUse: false });
    expect(process.env.MODEL_API_KEY).toBe("env-key");
    await removeMuseKey();
    expect(process.env.MODEL_API_KEY).toBe("env-key");
  });

  it("is picked up by another process's next call when the app replaces it", async () => {
    delete process.env.MODEL_API_KEY;
    delete process.env.MODEL_API_KEY_SOURCE;
    const { loadMuseKey } = await import("../lib/connect/muse");
    const { saveConnection } = await import("../lib/connections");
    await saveConnection({ provider: "muse", accountLabel: null, accessToken: "from-the-app", refreshToken: null, scopes: [], expiresAt: null, meta: {} });
    await loadMuseKey();
    expect(process.env.MODEL_API_KEY).toBe("from-the-app");
  });
});

describe.skipIf(!url)("Connect routes", () => {
  const ctx = { params: Promise.resolve({ provider: "google" }) } as never;
  const req = (path: string, headers: Record<string, string>, init: RequestInit = {}) =>
    new Request(`http://127.0.0.1:3000${path}`, { ...init, headers: { host: "127.0.0.1:3000", ...headers } });
  const errorOf = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("error");

  const start = (headers: Record<string, string>, scopes = "", host = "127.0.0.1:3000") =>
    new Request(`http://${host}/api/connect/google/start`, {
      method: "POST",
      headers: { host, "content-type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ scopes }),
    });

  it("start a sign-in only from the app's own page on this computer, and only by POST", async () => {
    const route = await import("../app/api/connect/[provider]/start/route");
    expect("GET" in route).toBe(false); // a plain link can't start a sign-in
    const { POST } = route;
    expect(errorOf(await POST(start({ "sec-fetch-site": "same-origin" }, "", "practice.example"), ctx))).toMatch(/your own computer/);
    // Another website posting a form to the app.
    expect(errorOf(await POST(start({ "sec-fetch-site": "cross-site" }), ctx))).toMatch(/your own computer/);
    expect(errorOf(await POST(start({ origin: "https://evil.example" }), ctx))).toMatch(/your own computer/);
    expect(errorOf(await POST(start({}), ctx))).toMatch(/your own computer/);
    const local = await POST(start({ "sec-fetch-site": "same-origin" }, "https://www.googleapis.com/auth/gmail.compose"), ctx);
    expect(local.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
  });

  it("ask Google only for Gmail drafts and the calendar", async () => {
    const { POST } = await import("../app/api/connect/[provider]/start/route");
    expect(errorOf(await POST(start({ "sec-fetch-site": "same-origin" }, "https://mail.google.com/"), ctx))).toMatch(/only asks Google/);
    const { startConnect } = await import("../lib/connect");
    await expect(startConnect("google", { scopes: ["https://www.googleapis.com/auth/drive"], origin: ORIGIN })).rejects.toThrow(/only asks Google/);
  });

  it("refuse a change sent by another website (form post or text/plain fetch)", async () => {
    const { POST } = await import("../app/api/settings/muse-key/route");
    const body = JSON.stringify({ key: "x".repeat(40) });
    const crossSite = await POST(req("/api/settings/muse-key", { "sec-fetch-site": "cross-site", "content-type": "text/plain" }, { method: "POST", body }));
    expect(crossSite.status).toBe(403);
    const foreignOrigin = await POST(req("/api/settings/muse-key", { origin: "https://evil.example", "content-type": "text/plain" }, { method: "POST", body }));
    expect(foreignOrigin.status).toBe(403);
    const notJson = await POST(req("/api/settings/muse-key", { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, { method: "POST", body }));
    expect(notJson.status).toBe(415);
    const museRoute = await import("../app/api/settings/muse-key/route");
    const json = { "content-type": "application/json" };
    // A spoofed Host (someone on the same network, or a DNS trick), even with a matching Origin.
    const spoofed = new Request("http://attacker.example:3000/api/settings/muse-key", { method: "POST", headers: { host: "attacker.example:3000", origin: "http://attacker.example:3000", ...json }, body });
    expect((await museRoute.POST(spoofed)).status).toBe(403);
    // No Origin and no Sec-Fetch-Site at all.
    expect((await museRoute.POST(req("/api/settings/muse-key", json, { method: "POST", body }))).status).toBe(403);
    expect((await museRoute.DELETE(req("/api/settings/muse-key", {}, { method: "DELETE" }))).status).toBe(403);
    expect((await museRoute.DELETE(req("/api/settings/muse-key", { "sec-fetch-site": "cross-site" }, { method: "DELETE" }))).status).toBe(403);
    expect((await museRoute.DELETE(new Request("http://attacker.example/api/settings/muse-key", { method: "DELETE", headers: { host: "attacker.example", "sec-fetch-site": "same-origin" } }))).status).toBe(403);
    const { DELETE } = await import("../app/api/connect/[provider]/route");
    expect((await DELETE(req("/api/connect/google", { "sec-fetch-site": "same-site" }, { method: "DELETE" }), ctx)).status).toBe(403);
    expect((await DELETE(req("/api/connect/google", { origin: "http://127.0.0.1:3000" }, { method: "DELETE" }), ctx)).status).toBe(200);
  });
});
