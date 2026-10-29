import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { canWrite, checkAnswers } from "@/app/api/onboarding/safety";
import { NER_MODEL, modelCacheDir } from "@/lib/aeon/phi-classifier";
import { QUESTIONS } from "@/lib/onboarding/chapters";
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

describe.skipIf(!existsSync(path.join(modelCacheDir(), NER_MODEL)))("who-I-help answers", () => {
  it("saves every offered chip with her own words (Oct 29: the Couples chip was refused)", async () => {
    const q = QUESTIONS.find((x) => x.id === "who")!;
    const answer = {
      chips: (q.options ?? []).map((x) => x.value),
      work: (q.workOptions ?? []).map((x) => x.value),
      text: "Couples going through big changes",
    };
    expect(await checkAnswers({ who: answer })).toEqual({ ok: true });
  }, 60_000);

  it("still refuses a client's name typed in her own words", async () => {
    const r = await checkAnswers({ who: { chips: ["Couples"], work: [], text: "My client Maria Lopez and her husband" } });
    expect(r.ok).toBe(false);
  }, 60_000);
});
