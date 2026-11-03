import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
// The route answers only while Front Desk is on (lib/features.ts); this file tests that behaviour.
vi.mock("../lib/features", async (orig) => ({ ...(await orig<typeof import("../lib/features")>()), FRONT_DESK_ENABLED: true }));

import { GET, POST } from "../app/api/website-chat/route";
import {
  allowWebChat,
  resetWebChatRateLimit,
  WEB_CHAT_MAX_BODY_BYTES,
  WEB_CHAT_POSTS_PER_MINUTE,
  WEB_CHAT_READS_PER_MINUTE,
  webChatClientIp,
} from "../lib/frontdesk/webchat-rate-limit";
import { proxy } from "../proxy";
import { REFERRALS_ONLY_DEMO } from "../lib/features";

const request = (method: "GET" | "POST", headers: Record<string, string>, body?: string, base = "http://localhost:3000") =>
  new Request(`${base}/api/website-chat?c=not-a-chat`, { method, headers, body });
const json = { "sec-fetch-site": "same-origin", "content-type": "application/json" };

afterEach(() => {
  resetWebChatRateLimit();
  vi.unstubAllEnvs();
});

describe("website chat request guard", () => {
  it("refuses cross-site reads and writes", async () => {
    expect((await GET(request("GET", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request("POST", { "sec-fetch-site": "cross-site", "content-type": "application/json" }, "{}"))).status).toBe(403);
  });

  it("accepts only JSON writes from its own page", async () => {
    expect((await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, "{}"))).status).toBe(415);
    const response = await POST(request("POST", json, "{}"));
    expect(response.status).toBe(400);
  });

  it("refuses a body over 16 KB before parsing it", async () => {
    const big = JSON.stringify({ text: "x".repeat(WEB_CHAT_MAX_BODY_BYTES) });
    expect((await POST(request("POST", json, big))).status).toBe(413);
    // Even when the size header is missing or understates it.
    const streamed = new Request("http://localhost:3000/api/website-chat", {
      method: "POST",
      headers: { ...json, "content-length": "10" },
      body: new Blob([big]).stream(),
      duplex: "half",
    } as RequestInit);
    expect((await POST(streamed)).status).toBe(413);
  });

  it("answers 429 at the route once a visitor hits the per-minute limit", async () => {
    const ip = "203.0.113.8";
    for (let i = 0; i < WEB_CHAT_POSTS_PER_MINUTE; i++) allowWebChat(`write:${ip}`, WEB_CHAT_POSTS_PER_MINUTE);
    const posted = await POST(request("POST", { ...json, "x-real-ip": ip }, JSON.stringify({ text: "What are your hours?" })));
    expect(posted.status).toBe(429);
    for (let i = 0; i < WEB_CHAT_READS_PER_MINUTE; i++) allowWebChat(`read:${ip}`, WEB_CHAT_READS_PER_MINUTE);
    expect((await GET(request("GET", { "sec-fetch-site": "same-origin", "x-real-ip": ip }))).status).toBe(429);
  });

  it("limits repeated messages without storing an IP address", () => {
    for (let i = 0; i < WEB_CHAT_POSTS_PER_MINUTE; i++) expect(allowWebChat("write:203.0.113.8", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(true);
    expect(allowWebChat("write:203.0.113.8", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(false);
    expect(allowWebChat("write:203.0.113.9", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(true);
  });

  it("keys on the platform's x-real-ip, never the visitor-written x-forwarded-for", () => {
    const headers = (h: Record<string, string>) => new Request("http://localhost:3000/", { headers: h });
    expect(webChatClientIp(headers({ "x-forwarded-for": "198.51.100.1, 203.0.113.7", "x-real-ip": "203.0.113.7" }))).toBe("203.0.113.7");
    expect(webChatClientIp(headers({ "x-forwarded-for": "198.51.100.1" }))).toBe("local");
  });
});

describe("website chat is local-only", () => {
  it("is a 404 on the Vercel copy, from the route and from proxy.ts", async () => {
    vi.stubEnv("VERCEL", "1");
    const base = "https://practice-os.vercel.app";
    expect((await GET(request("GET", { "sec-fetch-site": "same-origin" }, undefined, base))).status).toBe(404);
    expect((await POST(request("POST", json, JSON.stringify({ text: "hi" }), base))).status).toBe(404);
    expect(proxy(new NextRequest(`${base}/website-chat`)).status).toBe(404);
    expect(proxy(new NextRequest(`${base}/api/website-chat?c=x`)).status).toBe(404);
    // Other pages are untouched there (the referrals-only demo sends hidden pages Home: lib/features.ts).
    expect(proxy(new NextRequest(`${base}/front-desk`)).status).toBe(REFERRALS_ONLY_DEMO ? 307 : 200);
    expect(proxy(new NextRequest(`${base}/referrals`)).status).toBe(200);
  });

  it("answers on her own computer", async () => {
    expect(proxy(new NextRequest("http://localhost:3000/website-chat")).status).toBe(200);
    expect(await (await GET(request("GET", { "sec-fetch-site": "same-origin" }))).json()).toEqual({ error: "No such chat." }); // it answered
    const posted = await POST(request("POST", json, "{}"));
    expect(posted.status).toBe(400);
  });
});
