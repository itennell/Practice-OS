import { describe, expect, it } from "vitest";
import {
  calcomCheck,
  databaseCheck,
  envFileCheck,
  exitCode,
  formatReport,
  instagramCheck,
  museCheck,
  nodeCheck,
  privacyModelCheck,
  relayCheck,
  verdict,
} from "../lib/setup/doctor";
import { askRelayHealth } from "../lib/setup/relay-health";

const health = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("npm run doctor checks", () => {
  it("needs Node 20 or newer", () => {
    expect(nodeCheck("v20.11.0").state).toBe("ok");
    expect(nodeCheck("v26.7.0").state).toBe("ok");
    expect(nodeCheck("v18.19.0")).toMatchObject({ state: "problem", say: "Node 18.19.0 is too old." });
    expect(nodeCheck("").say).toBe("Node isn't installed.");
  });

  it("says the built-in database starts with the app instead of calling it broken", () => {
    expect(databaseCheck({ kind: "built-in", reachable: false }).state).toBe("todo");
    expect(databaseCheck({ kind: "supabase", reachable: false }).state).toBe("problem");
    expect(databaseCheck({ kind: "built-in", reachable: true }).say).toMatch(/built-in database/);
  });

  it("accepts a Muse key from .env or saved in the app", () => {
    expect(museCheck(true, null).state).toBe("ok");
    expect(museCheck(false, { connected: true, accountLabel: "Key ending 4f2a" }).say).toContain("Key ending 4f2a");
    expect(museCheck(false, { connected: false }).state).toBe("todo");
  });

  it("marks optional helpers as later, not as problems", () => {
    expect(calcomCheck(null).state).toBe("later");
    expect(relayCheck({ kind: "no-url" }).state).toBe("later");
    expect(instagramCheck(null, relayCheck({ kind: "no-url" })).state).toBe("later");
  });

  it("names the relay settings that are missing", () => {
    const r = relayCheck({ kind: "answered", ready: true, images: false, checks: { RELAY_URL: true, BLOB_READ_WRITE_TOKEN: false, CRON_SECRET: false } });
    expect(r.state).toBe("problem");
    expect(r.say).toMatch(/can't host post images/);
    expect(r.fix).toContain("BLOB_READ_WRITE_TOKEN, CRON_SECRET");
    const ready = relayCheck({ kind: "answered", ready: true, images: true, checks: {} });
    expect(instagramCheck(null, ready).state).toBe("todo");
    expect(instagramCheck({ connected: true, accountLabel: "@practiceos_" }, ready).say).toContain("@practiceos_");
  });

  it("is ready only when every required check is ok", () => {
    const required = [nodeCheck("v20.0.0"), envFileCheck(true), databaseCheck({ kind: "built-in", reachable: true }), privacyModelCheck(true), museCheck(true, null)];
    expect(exitCode([...required, calcomCheck(null)])).toBe(0);
    expect(verdict(required)).toMatch(/^Ready/);
    const missing = [...required, envFileCheck(false)];
    expect(exitCode(missing)).toBe(1);
    expect(verdict(missing)).toBe("Not ready yet: Settings file.");
  });

  it("never prints a value, only labels", () => {
    const out = formatReport([museCheck(false, { connected: true, accountLabel: "Key ending 4f2a" })]);
    expect(out).not.toMatch(/sk-|cal_|AC[0-9a-f]{8}/);
  });
});

describe("askRelayHealth", () => {
  it("reads a Practice-OS relay's yes/no settings", async () => {
    const out = await askRelayHealth("https://relay.example.com/", health({ ok: true, service: "practice-os-relay", ready: true, images: false, checks: { CRON_SECRET: false } }));
    expect(out).toEqual({ kind: "answered", ready: true, images: false, checks: { CRON_SECRET: false } });
  });

  it("refuses an address that isn't https or isn't a relay", async () => {
    expect(await askRelayHealth("", health({}))).toEqual({ kind: "no-url" });
    expect(await askRelayHealth("http://relay.example.com", health({}))).toMatchObject({ kind: "unreachable" });
    expect(await askRelayHealth("https://example.com", health({ hello: 1 }))).toMatchObject({ kind: "unreachable" });
  });

  it("reports a relay that doesn't answer", async () => {
    const down = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    expect(await askRelayHealth("https://relay.example.com", down)).toEqual({ kind: "unreachable", reason: "fetch failed" });
  });
});
