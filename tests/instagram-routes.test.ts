// Instagram's own POST routes take changes only from the app's own page, as JSON
// (same rule as lib/connect): another website open in her browser can't trigger them.
import { describe, expect, it } from "vitest";
import { POST as plan } from "../app/api/instagram/plan/route";
import { POST as ask } from "../app/api/instagram/posts/route";

const req = (url: string, headers: Record<string, string>) =>
  new Request(url, { method: "POST", headers: { host: "127.0.0.1:3000", ...headers }, body: JSON.stringify({ request: "a post about booking" }) });

describe("Instagram routes refuse other websites", () => {
  for (const [name, route, url] of [
    ["plan", plan, "http://127.0.0.1:3000/api/instagram/plan"],
    ["ask", ask, "http://127.0.0.1:3000/api/instagram/posts"],
  ] as const) {
    it(`${name}: a cross-site request is refused`, async () => {
      const res = await route(req(url, { "sec-fetch-site": "cross-site", "content-type": "application/json" }));
      expect(res.status).toBe(403);
    });
    it(`${name}: a same-origin form post (not JSON) is refused`, async () => {
      const res = await route(req(url, { "sec-fetch-site": "same-origin", "content-type": "text/plain" }));
      expect(res.status).toBe(403);
    });
  }
});
