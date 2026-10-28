import { afterEach, describe, expect, it } from "vitest";
import { canWrite } from "@/app/api/onboarding/safety";
import { refusal } from "@/lib/request-guard";

// Any web page she has open could POST to the app on localhost. proxy.ts refuses
// changes that aren't from the app's own page; onboarding also takes JSON only.

const req = (headers: Record<string, string>, host = "127.0.0.1:3000") =>
  new Request(`http://${host}/api/onboarding`, { method: "POST", headers: { host, ...headers } });
const JSON_SAME = { "content-type": "application/json", "sec-fetch-site": "same-origin" };

afterEach(() => {
  delete process.env.VERCEL;
});

describe("who may save onboarding answers", () => {
  it("a same-origin JSON POST gets through", () => {
    expect(refusal(req(JSON_SAME))).toBeNull();
    expect(canWrite(req(JSON_SAME))).toBe(true);
  });

  it("a cross-site text/plain POST is refused", () => {
    const r = req({ "content-type": "text/plain", "sec-fetch-site": "cross-site" });
    expect(refusal(r)).not.toBeNull();
    expect(canWrite(r)).toBe(false);
  });

  it("a POST with no Origin and no Sec-Fetch-Site is refused", () => {
    expect(refusal(req({ "content-type": "application/json" }))).not.toBeNull();
  });

  it("only JSON is accepted, even from the app's own page", () => {
    expect(canWrite(req({ "content-type": "text/plain", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(canWrite(req({ "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(canWrite(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("on the Vercel copy a change needs the admin password", () => {
    process.env.VERCEL = "1";
    expect(canWrite(req(JSON_SAME))).toBe(false);
  });
});
