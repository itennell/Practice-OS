// Connect buttons end to end on the test database: the real lib/connect and the
// real relay code, with Google's and Meta's servers faked at fetch().
// Runs only when DATABASE_URL is set (npm test sets a throwaway one).
import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { begin, callback, type RelayEnv } from "../relay/lib/handlers";

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
  if (sql) await sql`delete from practice_os.connections where provider in ('google', 'instagram', 'muse')`;
});
afterAll(async () => {
  process.env = saved;
  await sql?.end();
});

const idToken = (email: string) => `x.${Buffer.from(JSON.stringify({ email })).toString("base64url")}.y`;
const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

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
});

describe.skipIf(!url)("Instagram Connect through the relay", () => {
  it("connects end to end and never stores or shows a plain token", async () => {
    const { startConnect, finishConnect, getAccessToken } = await import("../lib/connect");
    const { getConnectionStatus } = await import("../lib/connect/status");
    const exchangeCode = async () => ({ accessToken: "IGlong", expiresIn: 5_183_944, userId: "17841", username: "practiceos_", scopes: ["instagram_business_basic", "instagram_business_content_publish"] });

    // The app's server calls the relay's begin; route that to the real handler.
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
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
  });

  it("records a cancelled sign-in and saves nothing", async () => {
    const { startConnect, finishConnect } = await import("../lib/connect");
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => begin(new Request(String(input), init), relayEnv, { now: Date.now }));
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

describe.skipIf(!url)("Connect routes", () => {
  it("work only on this computer, never through another host name", async () => {
    const { GET } = await import("../app/api/connect/[provider]/start/route");
    const ctx = { params: Promise.resolve({ provider: "google" }) } as never;
    const remote = await GET(new Request("http://practice.example/api/connect/google/start", { headers: { host: "practice.example" } }), ctx);
    expect(new URL(remote.headers.get("location")!).searchParams.get("error")).toMatch(/your own computer/);
    const local = await GET(new Request("http://127.0.0.1:3000/api/connect/google/start?scopes=email", { headers: { host: "127.0.0.1:3000" } }), ctx);
    expect(local.headers.get("location")).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});
