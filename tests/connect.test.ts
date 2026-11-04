// Her own Muse key end to end on the test database: saved encrypted through
// lib/connections.ts, and the Settings route refuses anything not sent by the app.
// Runs only when DATABASE_URL is set (npm test sets a throwaway one).
import { randomBytes } from "node:crypto";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 1, onnotice: () => {} }) : null;

const saved = { ...process.env };
beforeAll(() => {
  process.env.CONNECTIONS_ENCRYPTION_KEY ??= randomBytes(32).toString("base64");
});
afterEach(async () => {
  if (sql) await sql`delete from practice_os.connections where provider = 'muse'`;
});
afterAll(async () => {
  process.env = saved;
  await sql?.end();
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

describe.skipIf(!url)("The Muse key route", () => {
  const req = (path: string, headers: Record<string, string>, init: RequestInit = {}) =>
    new Request(`http://127.0.0.1:3000${path}`, { ...init, headers: { host: "127.0.0.1:3000", ...headers } });

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
  });
});
