import { afterEach, describe, expect, it } from "vitest";
import { GET, POST } from "../app/api/website-chat/route";
import { allowWebChat, resetWebChatRateLimit, WEB_CHAT_POSTS_PER_MINUTE } from "../lib/frontdesk/webchat-rate-limit";

const request = (method: "GET" | "POST", headers: Record<string, string>, body?: string) =>
  new Request("http://localhost:3000/api/website-chat?c=not-a-chat", { method, headers, body });

afterEach(() => resetWebChatRateLimit());

describe("website chat request guard", () => {
  it("refuses cross-site reads and writes", async () => {
    expect((await GET(request("GET", { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request("POST", { "sec-fetch-site": "cross-site", "content-type": "application/json" }, "{}"))).status).toBe(403);
  });

  it("accepts only JSON writes from its own page", async () => {
    expect((await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "text/plain" }, "{}"))).status).toBe(415);
    const response = await POST(request("POST", { "sec-fetch-site": "same-origin", "content-type": "application/json" }, "{}"));
    expect(response.status).toBe(400);
  });

  it("limits repeated messages without storing an IP address", () => {
    for (let i = 0; i < WEB_CHAT_POSTS_PER_MINUTE; i++) expect(allowWebChat("write:203.0.113.8", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(true);
    expect(allowWebChat("write:203.0.113.8", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(false);
    expect(allowWebChat("write:203.0.113.9", WEB_CHAT_POSTS_PER_MINUTE, 1_000)).toBe(true);
  });
});
