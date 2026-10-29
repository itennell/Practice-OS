// Is Instagram ready on this copy? The relay's /api/health, the app's check of it,
// the card's one rule for offering Connect, and the plain image-hosting error. No network.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  INSTAGRAM_IMAGES_NOT_READY,
  INSTAGRAM_NOT_READY,
  instagramReadiness,
  peekInstagramReadiness,
  resetInstagramReadiness,
  uploadToRelay,
} from "../lib/connect/instagram";
import { instagramConnectView, type CardCheckState } from "../lib/connect/instagram-card-view";
import { IMAGES_NOT_SET_UP, relayHealth } from "../relay/lib/health";

const full = {
  RELAY_URL: "https://relay.example.test",
  RELAY_STATE_KEY: Buffer.alloc(32, 1).toString("base64"),
  INSTAGRAM_APP_ID: "123",
  INSTAGRAM_APP_SECRET: "s",
  CRON_SECRET: "c",
  BLOB_READ_WRITE_TOKEN: "b",
};
const signInOnly = { ...full, CRON_SECRET: "", BLOB_READ_WRITE_TOKEN: "" };

describe("relayHealth", () => {
  it("is ready for sign-in without the image settings, and says images separately", () => {
    expect(relayHealth(signInOnly)).toMatchObject({ ready: true, images: false });
    expect(relayHealth(full)).toMatchObject({ ready: true, images: true });
  });

  it("reports yes/no, never a value", () => {
    expect(JSON.stringify(relayHealth(full))).not.toMatch(/relay\.example|"s"|"123"/);
    expect(relayHealth({ ...full, INSTAGRAM_APP_SECRET: "" })).toMatchObject({ ready: false, checks: { INSTAGRAM_APP_SECRET: false, INSTAGRAM_APP_ID: true } });
  });

  it("refuses a state key that isn't 32 bytes and a non-https address", () => {
    expect(relayHealth({ ...full, RELAY_STATE_KEY: "c2hvcnQ=" }).ready).toBe(false);
    expect(relayHealth({ ...full, RELAY_URL: "http://relay.example.test" }).ready).toBe(false);
  });
});

describe("instagram readiness", () => {
  const saved = process.env.RELAY_URL;
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const counting = (body: unknown) => {
    const calls: string[] = [];
    const impl = (async (u: string) => (calls.push(String(u)), new Response(JSON.stringify(body)))) as unknown as typeof fetch;
    return { calls, impl };
  };
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
    const f = counting({});
    expect(await instagramReadiness(f.impl)).toEqual({ ready: false, reason: "RELAY_URL is not set in .env" });
    expect(peekInstagramReadiness(f.impl)).toEqual({ ready: false, reason: "RELAY_URL is not set in .env" });
    expect(f.calls).toHaveLength(0);
  });

  it("asks the relay's health route; a relay without image hosting still allows sign-in", async () => {
    const f = counting(relayHealth(signInOnly));
    expect(await instagramReadiness(f.impl)).toEqual({ ready: true });
    expect(f.calls).toEqual(["https://relay.example.test/api/health"]);
  });

  it("names only the missing sign-in settings in the reason", async () => {
    const out = await instagramReadiness(answer(relayHealth({ ...signInOnly, INSTAGRAM_APP_ID: "", INSTAGRAM_APP_SECRET: "" })));
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

  it("peek never waits: nothing known shows Connect, then the background answer is used", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let n = 0;
    const slow = (async () => (n++, await gate, new Response(JSON.stringify(relayHealth({ ...full, INSTAGRAM_APP_ID: "" }))))) as unknown as typeof fetch;
    expect(peekInstagramReadiness(slow, () => 0)).toBeNull();
    expect(peekInstagramReadiness(slow, () => 1)).toBeNull();
    expect(n).toBe(1); // one request in flight, shared
    release();
    await instagramReadiness(slow, () => 2); // joins the same request
    expect(n).toBe(1);
    expect(peekInstagramReadiness(slow, () => 3)).toMatchObject({ ready: false });
  });

  it("keeps a working answer a minute and a failure only 15 seconds", async () => {
    const ok = counting(relayHealth(full));
    await instagramReadiness(ok.impl, () => 0);
    await instagramReadiness(ok.impl, () => 59_000);
    expect(ok.calls).toHaveLength(1);
    await instagramReadiness(ok.impl, () => 61_000);
    expect(ok.calls).toHaveLength(2);

    resetInstagramReadiness();
    const bad = counting(relayHealth({ ...full, RELAY_STATE_KEY: "" }));
    await instagramReadiness(bad.impl, () => 0);
    await instagramReadiness(bad.impl, () => 14_000);
    expect(bad.calls).toHaveLength(1);
    await instagramReadiness(bad.impl, () => 16_000);
    expect(bad.calls).toHaveLength(2);
  });

  it("turns the relay's image-hosting 503 into one plain sentence", async () => {
    const f = answer({ error: IMAGES_NOT_SET_UP }, 503);
    const realFetch = globalThis.fetch;
    globalThis.fetch = f;
    try {
      await expect(uploadToRelay(Buffer.from([0xff, 0xd8]), { userId: "1", uploadKey: "k" })).rejects.toThrow(INSTAGRAM_IMAGES_NOT_READY);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("instagramConnectView", () => {
  const states: CardCheckState[] = ["not_connected", "needs_reconnect", "unreachable"];
  it.each(states)("%s: offers Connect when ready, says not ready instead when not", (state) => {
    expect(instagramConnectView(state)).toEqual({ showConnect: true });
    expect(instagramConnectView(state, INSTAGRAM_NOT_READY)).toEqual({ showConnect: false, notReady: INSTAGRAM_NOT_READY });
  });
  it("never offers Connect while checking or connected", () => {
    for (const state of ["checking", "connected"] as const) {
      expect(instagramConnectView(state, INSTAGRAM_NOT_READY)).toEqual({ showConnect: false });
      expect(instagramConnectView(state)).toEqual({ showConnect: false });
    }
  });
});
