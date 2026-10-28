// The Connect Instagram round trip against a stub relay and Meta's documented
// replies: start, the practiceos:// return, the encrypted token, the live check.
// Database test: runs only when DATABASE_URL is set (a throwaway local Postgres).
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as status, POST as start } from "../app/api/connect/instagram/route";
import { GET as returnRoute } from "../app/api/connect/instagram/return/route";
import { getConnection } from "../lib/connections";
import { closeDb, db } from "../lib/db";
import { takeState } from "../lib/instagram/connect";

const hasDb = Boolean(process.env.DATABASE_URL);
const fx = (name: string) => JSON.parse(readFileSync(`lib/instagram/__fixtures__/${name}.json`, "utf8")).body;
const RELAY = "https://relay.test";

/** Stands in for the relay and graph.instagram.com, by URL. */
function stubNetwork(opts: { meStatus?: number } = {}) {
  const seen: string[] = [];
  const impl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    seen.push(`${init?.method ?? "GET"} ${url.origin}${url.pathname}`);
    if (url.origin === RELAY && url.pathname === "/oauth/instagram/redeem") {
      const { handoff } = JSON.parse(String(init?.body));
      if (handoff !== "H1") return new Response("gone", { status: 404 });
      return Response.json({ access_token: "IGAA-live-test", user_id: "17841400000000001", permissions: ["instagram_business_basic", "instagram_business_content_publish"], expires_in: 5183944 });
    }
    if (url.origin === "https://graph.instagram.com" && url.pathname.endsWith("/me")) {
      return opts.meStatus ? Response.json(fx("error_token_expired"), { status: opts.meStatus }) : Response.json(fx("me"));
    }
    return new Response("unexpected", { status: 500 });
  };
  return { seen, impl };
}

beforeAll(() => {
  process.env.INSTAGRAM_APP_ID = "1234567890";
  process.env.RELAY_URL = RELAY;
  process.env.CONNECTIONS_ENCRYPTION_KEY ||= randomBytes(32).toString("base64");
});

afterAll(async () => {
  vi.unstubAllGlobals();
  if (!hasDb) return;
  await db()`delete from practice_os.connections where provider = 'instagram'`;
  await closeDb();
});

const post = () => new Request("http://localhost:3000/api/connect/instagram", { method: "POST" });

describe("starting the sign-in", () => {
  it("sends her to Instagram with a one-time state", async () => {
    const res = await start(post());
    const { url } = await res.json();
    const state = new URL(url).searchParams.get("state")!;
    expect(state).toHaveLength(43);
    expect(takeState(state)).toBe(true);
    expect(takeState(state)).toBe(false);
  });

  it("explains in plain words when Instagram sign-in isn't set up", async () => {
    delete process.env.RELAY_URL;
    const res = await start(post());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/isn't switched on/);
    process.env.RELAY_URL = RELAY;
  });
});

describe.skipIf(!hasDb)("the return from the relay", () => {
  it("redeems once, stores the token encrypted and shows the username", async () => {
    const net = stubNetwork();
    vi.stubGlobal("fetch", net.impl);
    const { url } = await (await start(post())).json();
    const state = new URL(url).searchParams.get("state")!;

    const res = await returnRoute(new Request(`http://localhost:3000/api/connect/instagram/return?handoff=H1&state=${state}`));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toContain("instagram=connected&username=practiceos_");

    const [raw] = await db()`select access_token_enc, account_label from practice_os.connections where provider = 'instagram'`;
    expect(raw.account_label).toBe("practiceos_");
    expect(String(raw.access_token_enc)).not.toContain("IGAA-live-test");
    const c = await getConnection("instagram");
    expect(c?.accessToken).toBe("IGAA-live-test");
    expect(c?.meta.ig_user_id).toBe("17841400000000001");

    expect(await (await status()).json()).toMatchObject({ state: "connected", username: "practiceos_" });

    // The same link a second time does nothing.
    const again = await returnRoute(new Request(`http://localhost:3000/api/connect/instagram/return?handoff=H1&state=${state}`));
    expect(again.headers.get("location")).toContain("instagram=error");
  });

  it("asks her to reconnect when Instagram stops accepting the token", async () => {
    vi.stubGlobal("fetch", stubNetwork({ meStatus: 400 }).impl);
    expect(await (await status()).json()).toMatchObject({ state: "needs_reconnect", username: "practiceos_" });
  });

  it("says plainly when she cancelled on Instagram", async () => {
    const { url } = await (await start(post())).json();
    const state = new URL(url).searchParams.get("state")!;
    const res = await returnRoute(new Request(`http://localhost:3000/api/connect/instagram/return?error=user_denied&state=${state}`));
    expect(decodeURIComponent(res.headers.get("location")!)).toMatch(/cancelled/);
  });

  it("refuses a hand-off with a state this app never started", async () => {
    const res = await returnRoute(new Request("http://localhost:3000/api/connect/instagram/return?handoff=H1&state=forged"));
    expect(res.headers.get("location")).toContain("instagram=error");
  });
});
