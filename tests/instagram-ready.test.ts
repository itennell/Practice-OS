// Is Instagram ready on this copy? The relay's /api/health and the app's check of it. No network.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { INSTAGRAM_NOT_READY, instagramReadiness, resetInstagramReadiness } from "../lib/connect/instagram";
import { relayHealth } from "../relay/lib/health";

const full = {
  RELAY_URL: "https://relay.example.test",
  RELAY_STATE_KEY: Buffer.alloc(32, 1).toString("base64"),
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "s",
  CRON_SECRET: "c",
  BLOB_READ_WRITE_TOKEN: "b",
};

describe("relayHealth", () => {
  it("is ready only with every setting, and reports yes/no, never a value", () => {
    const h = relayHealth(full);
    expect(h.ready).toBe(true);
    expect(JSON.stringify(h)).not.toMatch(/relay\.example|"s"|"123"/);
    const missing = relayHealth({ ...full, INSTAGRAM_APP_SECRET: "" });
    expect(missing).toMatchObject({ ready: false, checks: { INSTAGRAM_APP_SECRET: false, INSTAGRAM_APP_ID: true } });
  });

  it("refuses a state key that isn't 32 bytes and a non-https address", () => {
    expect(relayHealth({ ...full, RELAY_STATE_KEY: "c2hvcnQ=" }).checks.RELAY_STATE_KEY).toBe(false);
    expect(relayHealth({ ...full, RELAY_URL: "http://relay.example.test" }).checks.RELAY_URL).toBe(false);
  });
});

describe("instagramReadiness", () => {
  const saved = process.env.RELAY_URL;
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  beforeEach(() => {
    resetInstagramReadiness();
    process.env.RELAY_URL = "https://relay.example.test/";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.RELAY_URL;
    else process.env.RELAY_URL = saved;
  });

  it("says plainly that Instagram isn't ready", () => {
    expect(INSTAGRAM_NOT_READY).toBe("Instagram isn't ready on this copy yet.");
  });

  it("is not ready without RELAY_URL, and never calls out", async () => {
    delete process.env.RELAY_URL;
    let called = false;
    const out = await instagramReadiness((async () => ((called = true), new Response("{}"))) as unknown as typeof fetch);
    expect(out).toEqual({ ready: false, reason: "RELAY_URL is not set in .env" });
    expect(called).toBe(false);
  });

  it("asks the relay's health route and is ready when it is", async () => {
    let url = "";
    const f = (async (u: string) => ((url = String(u)), new Response(JSON.stringify(relayHealth(full))))) as unknown as typeof fetch;
    expect(await instagramReadiness(f)).toEqual({ ready: true });
    expect(url).toBe("https://relay.example.test/api/health");
  });

  it("names the missing relay settings in the reason", async () => {
    const out = await instagramReadiness(answer(relayHealth({ ...full, INSTAGRAM_APP_ID: "", INSTAGRAM_APP_SECRET: "" })));
    expect(out).toEqual({ ready: false, reason: "relay is missing INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET" });
  });

  it("is not ready when the relay errors or can't be reached", async () => {
    expect(await instagramReadiness(answer({}, 404))).toMatchObject({ ready: false, reason: "relay health answered HTTP 404" });
    resetInstagramReadiness();
    const down = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await instagramReadiness(down)).toMatchObject({ ready: false, reason: "relay unreachable: fetch failed" });
  });

  it("remembers the answer for a minute", async () => {
    let n = 0;
    const f = (async () => (n++, new Response(JSON.stringify(relayHealth(full))))) as unknown as typeof fetch;
    await instagramReadiness(f, 0);
    await instagramReadiness(f, 59_000);
    expect(n).toBe(1);
    await instagramReadiness(f, 61_000);
    expect(n).toBe(2);
  });
});
