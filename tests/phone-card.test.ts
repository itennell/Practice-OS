// The phone Connect card's states and the demo line's texting status, in plain code. No network.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { phoneCardView } from "../lib/frontdesk/phone/card-view";
import { quickCache } from "../lib/frontdesk/phone/quick-cache";
import { newestStatus, resetTollfreeCache, textingNote, tollfreeStatus } from "../lib/frontdesk/phone/tollfree";
import { fakeFetch } from "./helpers/fake-fetch";

describe("phoneCardView", () => {
  it("shows the demo line as connected, with no Spruce setup and no disconnect", () => {
    const v = phoneCardView({ connected: true, devLine: true, number: "+18555027670", note: "pending note" });
    expect(v).toMatchObject({ connected: true, accountLabel: "Demo line (855) 502-7670, run by Twilio", note: "pending note", showSetup: false, canDisconnect: false });
    expect(v.description).not.toMatch(/your own phone company/);
  });

  it("passes a demo-line problem through as a fix", () => {
    expect(phoneCardView({ connected: true, devLine: true, number: "+18555027670", fix: "Twilio didn't answer." }).fix).toBe("Twilio didn't answer.");
  });

  it("shows her own connected line with a disconnect button", () => {
    const v = phoneCardView({ connected: true, label: "Connected: (312) 555-0100" });
    expect(v).toMatchObject({ connected: true, accountLabel: "(312) 555-0100", showSetup: false, canDisconnect: true });
    expect(v.description).toMatch(/your own phone company/);
  });

  it("offers the Spruce setup only when nothing is connected", () => {
    expect(phoneCardView({ connected: false })).toMatchObject({ connected: false, showSetup: true, canDisconnect: false });
  });
});

describe("textingNote", () => {
  it("says texts start after approval while pending or in review", () => {
    expect(textingNote("PENDING_REVIEW")).toMatch(/once the phone carriers approve/);
    expect(textingNote("IN_REVIEW")).toBe(textingNote("PENDING_REVIEW"));
  });
  it("says plainly when texting was turned down", () => {
    expect(textingNote("TWILIO_REJECTED")).toMatch(/turned down/);
  });
  it("says nothing once approved or when the status is unknown", () => {
    expect(textingNote("TWILIO_APPROVED")).toBeNull();
    expect(textingNote("unknown")).toBeNull();
  });
});

describe("newestStatus", () => {
  it("picks the newest verification by date_updated, then date_created, whatever the order", () => {
    expect(
      newestStatus([
        { status: "TWILIO_REJECTED", date_created: "2026-10-01T00:00:00Z", date_updated: "2026-10-05T00:00:00Z" },
        { status: "IN_REVIEW", date_created: "2026-10-20T00:00:00Z", date_updated: "2026-10-27T00:00:00Z" },
        { status: "PENDING_REVIEW", date_created: "2026-10-10T00:00:00Z" },
      ]),
    ).toBe("IN_REVIEW");
    expect(newestStatus([{ status: "PENDING_REVIEW", date_created: "2026-10-01T00:00:00Z" }, { status: "TWILIO_APPROVED", date_created: "2026-10-02T00:00:00Z" }])).toBe("TWILIO_APPROVED");
  });
  it("is unknown with nothing filed or an unexpected status", () => {
    expect(newestStatus([])).toBe("unknown");
    expect(newestStatus([{ status: "SOMETHING_NEW" }])).toBe("unknown");
  });
});

describe("tollfreeStatus", () => {
  const cfg = { accountSid: "AC_fake", authToken: "tok_fake", phoneNumber: "+18555550100" };
  const routes = (verifications: unknown[], status = 200) => [
    { match: "GET /IncomingPhoneNumbers.json", json: { incoming_phone_numbers: [{ sid: "PN_fake" }] } },
    { match: "GET /Tollfree/Verifications", status, json: { verifications } },
  ];
  beforeEach(resetTollfreeCache);

  it("reads the line's verification by its number sid", async () => {
    const f = fakeFetch(routes([{ status: "IN_REVIEW" }]));
    expect(await tollfreeStatus(cfg, f.impl, () => 0)).toBe("IN_REVIEW");
    expect(f.calls[1].url).toContain("TollfreePhoneNumberSid=PN_fake");
    expect(f.calls[1].url.startsWith("https://messaging.twilio.com/v1/")).toBe(true);
  });

  it("keeps a real answer ten minutes, then shows it while one refresh runs", async () => {
    const f = fakeFetch(routes([{ status: "IN_REVIEW" }]));
    await tollfreeStatus(cfg, f.impl, () => 0);
    await tollfreeStatus(cfg, f.impl, () => 9 * 60_000);
    expect(f.calls).toHaveLength(2);
    expect(await tollfreeStatus(cfg, f.impl, () => 11 * 60_000)).toBe("IN_REVIEW"); // stale answer at once
    expect(f.calls.length).toBeGreaterThan(2);
  });

  it("doesn't keep a failure: the next load asks Twilio again", async () => {
    const bad = fakeFetch(routes([], 500));
    expect(await tollfreeStatus(cfg, bad.impl, () => 0)).toBe("unknown");
    const good = fakeFetch(routes([{ status: "TWILIO_APPROVED" }]));
    expect(await tollfreeStatus(cfg, good.impl, () => 1_000)).toBe("TWILIO_APPROVED");
  });

  it("asks Twilio once for callers that arrive together", async () => {
    let n = 0;
    const f = fakeFetch(routes([{ status: "IN_REVIEW" }]));
    const counted = (async (input: RequestInfo | URL, init?: RequestInit) => (n++, f.impl(input, init))) as typeof fetch;
    const all = await Promise.all([1, 2, 3].map(() => tollfreeStatus(cfg, counted, () => 0)));
    expect(all).toEqual(["IN_REVIEW", "IN_REVIEW", "IN_REVIEW"]);
    expect(n).toBe(2); // one number lookup + one verification read
  });

  it("skips the lookup for a number that isn't toll-free", async () => {
    const f = fakeFetch(routes([]));
    expect(await tollfreeStatus({ ...cfg, phoneNumber: "+13125550100" }, f.impl, () => 0)).toBe("TWILIO_APPROVED");
    expect(f.calls).toHaveLength(0);
  });
});

describe("quickCache", () => {
  const make = () => quickCache<string | null>({ ttlMs: 1_000, waitMs: 50, keep: (v) => v === "ok" });

  it("gives up waiting after waitMs with the fallback, and keeps the late answer for next time", async () => {
    vi.useFakeTimers();
    try {
      const c = make();
      let finish!: (v: string) => void;
      const slow = () => new Promise<string>((r) => (finish = r));
      const first = c.get("k", slow, null, () => 0);
      await vi.advanceTimersByTimeAsync(60);
      expect(await first).toBeNull();
      finish("ok");
      await vi.advanceTimersByTimeAsync(0);
      expect(await c.get("k", slow, null, () => 10)).toBe("ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the fallback when the load throws, and doesn't keep it", async () => {
    const c = make();
    expect(await c.get("k", async () => Promise.reject(new Error("down")), null, () => 0)).toBeNull();
    expect(await c.get("k", async () => "ok", null, () => 1)).toBe("ok");
  });

  it("forgets on request", async () => {
    const c = make();
    await c.get("k", async () => "ok", null, () => 0);
    c.forget();
    let called = false;
    await c.get("k", async () => ((called = true), "ok"), null, () => 1);
    expect(called).toBe(true);
  });
});
