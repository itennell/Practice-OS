import { describe, expect, it } from "vitest";
import { canWrite } from "@/app/api/onboarding/safety";

// Any web page she has open could POST to the app on localhost. Onboarding answers
// (including the approval mode and her tax ID) only change from the app's own page.

const req = (headers: Record<string, string>) =>
  new Request("http://127.0.0.1:3000/api/onboarding", { method: "POST", headers: { host: "127.0.0.1:3000", ...headers } });

describe("who may save onboarding answers", () => {
  it("accepts JSON from the app's own page", () => {
    expect(canWrite(req({ "content-type": "application/json", "sec-fetch-site": "same-origin" }))).toBe(true);
    expect(canWrite(req({ "content-type": "application/json", origin: "http://127.0.0.1:3000" }))).toBe(true);
  });

  it("refuses another website, a plain form and text/plain", () => {
    expect(canWrite(req({ "content-type": "application/json", "sec-fetch-site": "cross-site" }))).toBe(false);
    expect(canWrite(req({ "content-type": "application/json", origin: "https://evil.example" }))).toBe(false);
    expect(canWrite(req({ "content-type": "text/plain", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(canWrite(req({ "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" }))).toBe(false);
    expect(canWrite(req({ "sec-fetch-site": "same-origin" }))).toBe(false);
  });

  it("refuses a request that reaches the app under another host name", () => {
    const r = new Request("http://rebind.example/api/onboarding", {
      method: "POST",
      headers: { host: "rebind.example", "content-type": "application/json", "sec-fetch-site": "same-origin" },
    });
    expect(canWrite(r)).toBe(false);
  });
});
