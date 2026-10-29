// The phone Connect card's states and the demo line's texting status, in plain code. No network.
import { beforeEach, describe, expect, it } from "vitest";
import { phoneCardView } from "../lib/frontdesk/phone/card-view";
import { resetTollfreeCache, textingNote, tollfreeStatus } from "../lib/frontdesk/phone/tollfree";
import { fakeFetch } from "./helpers/fake-fetch";

describe("phoneCardView", () => {
  it("shows the demo line as connected, with no Spruce setup and no disconnect", () => {
    const v = phoneCardView({ connected: true, devLine: true, number: "+18555027670", note: "pending note" });
    expect(v).toMatchObject({ connected: true, accountLabel: "Demo line (855) 502-7670, run by Twilio", note: "pending note", showSpruceSetup: false, canDisconnect: false });
    expect(v.description).not.toMatch(/your own phone company/);
  });

  it("passes a demo-line problem through as a fix", () => {
    expect(phoneCardView({ connected: true, devLine: true, number: "+18555027670", fix: "Twilio didn't answer." }).fix).toBe("Twilio didn't answer.");
  });

  it("shows her own connected line with a disconnect button", () => {
    const v = phoneCardView({ connected: true, label: "Connected: (312) 555-0100" });
    expect(v).toMatchObject({ connected: true, accountLabel: "(312) 555-0100", showSpruceSetup: false, canDisconnect: true });
    expect(v.description).toMatch(/your own phone company/);
  });

  it("offers the Spruce setup only when nothing is connected", () => {
    expect(phoneCardView({ connected: false })).toMatchObject({ connected: false, showSpruceSetup: true, canDisconnect: false });
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

describe("tollfreeStatus", () => {
  const cfg = { accountSid: "AC_fake", authToken: "tok_fake", phoneNumber: "+18555550100" };
  const routes = (verifications: unknown[], status = 200) => [
    { match: "GET /IncomingPhoneNumbers.json", json: { incoming_phone_numbers: [{ sid: "PN_fake" }] } },
    { match: "GET /Tollfree/Verifications", status, json: { verifications } },
  ];
  beforeEach(resetTollfreeCache);

  it("reads the line's verification by its number sid", async () => {
    const f = fakeFetch(routes([{ status: "IN_REVIEW" }]));
    expect(await tollfreeStatus(cfg, f.impl, 0)).toBe("IN_REVIEW");
    expect(f.calls[1].url).toContain("TollfreePhoneNumberSid=PN_fake");
    expect(f.calls[1].url.startsWith("https://messaging.twilio.com/v1/")).toBe(true);
  });

  it("caches for ten minutes", async () => {
    const f = fakeFetch(routes([{ status: "TWILIO_APPROVED" }]));
    await tollfreeStatus(cfg, f.impl, 0);
    await tollfreeStatus(cfg, f.impl, 9 * 60_000);
    expect(f.calls).toHaveLength(2);
    await tollfreeStatus(cfg, f.impl, 11 * 60_000);
    expect(f.calls).toHaveLength(4);
  });

  it("fails soft to unknown when Twilio errors or has no verification", async () => {
    expect(await tollfreeStatus(cfg, fakeFetch(routes([], 500)).impl, 0)).toBe("unknown");
    resetTollfreeCache();
    expect(await tollfreeStatus(cfg, fakeFetch(routes([])).impl, 0)).toBe("unknown");
  });

  it("skips the lookup for a number that isn't toll-free", async () => {
    const f = fakeFetch(routes([]));
    expect(await tollfreeStatus({ ...cfg, phoneNumber: "+13125550100" }, f.impl, 0)).toBe("TWILIO_APPROVED");
    expect(f.calls).toHaveLength(0);
  });
});
