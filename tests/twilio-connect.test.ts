import { describe, expect, it } from "vitest";
import { connectTwilio } from "../lib/frontdesk/connect";
import { getPhoneAdapter, ownTwilioConfig } from "../lib/frontdesk/phone";
import { voicemailUrl } from "../lib/frontdesk/phone/twilio";
import { TEXTING_APPROVAL, TWILIO_STEP_TEXT, VOICEMAIL_OFFER } from "../lib/frontdesk/phone/twilio-setup";
import { phoneCardView } from "../lib/frontdesk/phone/card-view";
import { fakeFetch } from "./helpers/fake-fetch";
import { grade } from "./helpers/readability";

const SID = `AC${"a".repeat(32)}`;
const TOKEN = "b".repeat(32);
const number = (sid: string, phone: string) => ({ sid, phone_number: phone });

describe("voicemail on her own Twilio number", () => {
  it("is Twilio-hosted TwiML: her greeting, a recording, then hang up (no loop, no public address)", () => {
    const url = new URL(voicemailUrl("Hi, this is Dana & team. Leave a <message>."));
    expect(url.origin + url.pathname).toBe("https://twimlets.com/echo");
    const twiml = url.searchParams.get("Twiml")!;
    expect(twiml).toContain("<Say>Hi, this is Dana &amp; team. Leave a &lt;message&gt;.</Say>");
    expect(twiml).toMatch(/<Record maxLength="120"[^>]*action="https:\/\/twimlets\.com\/echo\?Twiml=[^"]*Hangup/);
  });
});

describe("connectTwilio", () => {
  it("refuses keys that aren't shaped like Twilio's before calling Twilio", async () => {
    const f = fakeFetch([]);
    expect(await connectTwilio({ accountSid: "SK123", authToken: TOKEN }, f.impl)).toMatchObject({ ok: false, fix: expect.stringMatching(/starts with AC/) });
    expect(await connectTwilio({ accountSid: SID, authToken: "short" }, f.impl)).toMatchObject({ ok: false, fix: expect.stringMatching(/32 letters/) });
    expect(f.calls).toHaveLength(0);
  });

  it("says plainly when Twilio refuses the keys or there's no number yet", async () => {
    expect(await connectTwilio({ accountSid: SID, authToken: TOKEN }, fakeFetch([{ match: "GET IncomingPhoneNumbers", status: 401 }]).impl)).toMatchObject({
      ok: false,
      fix: expect.stringMatching(/didn't accept those keys/),
    });
    expect(await connectTwilio({ accountSid: SID, authToken: TOKEN }, fakeFetch([{ match: "GET IncomingPhoneNumbers", json: { incoming_phone_numbers: [] } }]).impl)).toMatchObject({
      ok: false,
      fix: expect.stringMatching(/Buy a toll-free number/),
    });
  });

  it("asks which number when there are two toll-free ones", async () => {
    const f = fakeFetch([{ match: "GET IncomingPhoneNumbers", json: { incoming_phone_numbers: [number("PN1", "+18885550100"), number("PN2", "+18335550100")] } }]);
    const out = await connectTwilio({ accountSid: SID, authToken: TOKEN }, f.impl);
    expect(out).toMatchObject({ ok: false, choose: [{ sid: "PN1", tollFree: true }, { sid: "PN2", tollFree: true }] });
  });

  it("picks the only toll-free number and saves the line without changing anything on her Twilio account", async () => {
    const f = fakeFetch([{ match: "GET IncomingPhoneNumbers", json: { incoming_phone_numbers: [number("PNlocal", "+13125550100"), number("PNtf", "+18885550100")] } }]);
    expect(await connectTwilio({ accountSid: SID, authToken: TOKEN }, f.impl)).toEqual({ ok: true, label: "Connected: (888) 555-0100 (Twilio)" });
    expect(f.calls.filter((c) => c.method !== "GET")).toEqual([]);
    expect(await ownTwilioConfig()).toMatchObject({ accountSid: SID, authToken: TOKEN, phoneNumber: "+18885550100", numberSid: "PNtf", voicemailOn: false });
    if (!process.env.FRONT_DESK_DEV_TWILIO) expect((await getPhoneAdapter())?.vendor).toBe("twilio");
  });

  it("sends calls to voicemail only when she presses the button, keeps the old setting, and Undo puts it back", async () => {
    const { turnOnTwilioVoicemail, undoTwilioVoicemail, disconnectPhone } = await import("../lib/frontdesk/connect");
    const on = fakeFetch([
      { match: "GET IncomingPhoneNumbers/PNtf.json", json: { voice_url: "https://demo.twilio.com/welcome/voice/", voice_method: "POST" } },
      { match: "POST IncomingPhoneNumbers/PNtf.json", json: {} },
    ]);
    expect(await turnOnTwilioVoicemail(on.impl)).toMatchObject({ ok: true });
    expect(new URLSearchParams(on.calls.find((c) => c.method === "POST")!.body!).get("VoiceUrl")).toMatch(/^https:\/\/twimlets\.com\/echo\?Twiml=/);
    expect(await ownTwilioConfig()).toMatchObject({ voicemailOn: true, previousVoiceUrl: "https://demo.twilio.com/welcome/voice/", previousVoiceMethod: "POST" });

    const undo = fakeFetch([{ match: "POST IncomingPhoneNumbers/PNtf.json", json: {} }]);
    expect(await undoTwilioVoicemail(undo.impl)).toMatchObject({ ok: true });
    const restored = new URLSearchParams(undo.calls[0].body!);
    expect([restored.get("VoiceUrl"), restored.get("VoiceMethod")]).toEqual(["https://demo.twilio.com/welcome/voice/", "POST"]);
    expect((await ownTwilioConfig())?.voicemailOn).toBe(false);
    expect(await undoTwilioVoicemail(undo.impl)).toMatchObject({ ok: false });

    const { db } = await import("../lib/db");
    const actions = (await db()`select action from practice_os.audit_log where action like 'phone_voicemail%' order by at desc, id desc limit 2`).map((r) => r.action);
    expect(actions).toEqual(["phone_voicemail_undone", "phone_voicemail_on"]);
    await disconnectPhone();
  });
});

describe("phone card for her own Twilio line", () => {
  it("explains texting approval until the carriers approve it, and offers the greeting again", () => {
    expect(phoneCardView({ connected: true, vendor: "twilio", texting: "IN_REVIEW" })).toMatchObject({ showTextingApproval: true, offerVoicemail: true, canUndoVoicemail: false, canRefreshGreeting: false, canDisconnect: true });
    expect(phoneCardView({ connected: true, vendor: "twilio", voicemailOn: true })).toMatchObject({ offerVoicemail: false, canUndoVoicemail: true, canRefreshGreeting: true });
    expect(phoneCardView({ connected: true, vendor: "twilio", texting: "TWILIO_APPROVED" }).showTextingApproval).toBe(false);
    expect(phoneCardView({ connected: true, vendor: "spruce" })).toMatchObject({ showTextingApproval: false, canRefreshGreeting: false });
    expect(phoneCardView({ connected: false }).showSetup).toBe(true);
  });

  it("reads at about a 6th-grade level, one action per step", () => {
    const steps = Object.values(TWILIO_STEP_TEXT);
    const text = [...steps.flatMap((s) => [s.title, s.see, s.more ?? ""]), TEXTING_APPROVAL.title, ...TEXTING_APPROVAL.steps, TEXTING_APPROVAL.wait, VOICEMAIL_OFFER.title, VOICEMAIL_OFFER.body].join(" ");
    expect(grade(text)).toBeLessThanOrEqual(6);
    for (const { title } of steps) expect(title.split(/[.!?](\s|$)/).filter((x) => x?.trim())).toHaveLength(1);
  });
});

describe("leaving her number as she found it", () => {
  const PREV = { voice_url: "https://demo.twilio.com/welcome/voice/", voice_method: "POST" };
  const list = { match: "GET IncomingPhoneNumbers.json", json: { incoming_phone_numbers: [number("PNtf", "+18885550100")] } };

  it("disconnecting with voicemail on puts the old call setting back first", async () => {
    const { turnOnTwilioVoicemail, disconnectPhone } = await import("../lib/frontdesk/connect");
    await connectTwilio({ accountSid: SID, authToken: TOKEN }, fakeFetch([list, { match: "GET IncomingPhoneNumbers/PNtf.json", json: PREV }]).impl);
    await turnOnTwilioVoicemail(fakeFetch([{ match: "GET IncomingPhoneNumbers/PNtf.json", json: PREV }, { match: "POST IncomingPhoneNumbers/PNtf.json", json: {} }]).impl);

    // Twilio down: nothing is forgotten, so Undo is still possible.
    const down = fakeFetch([{ match: "POST IncomingPhoneNumbers/PNtf.json", status: 500, json: {} }]);
    expect(await disconnectPhone(down.impl)).toMatchObject({ ok: false, fix: expect.stringMatching(/stays connected/) });
    expect((await ownTwilioConfig())?.voicemailOn).toBe(true);

    const up = fakeFetch([{ match: "POST IncomingPhoneNumbers/PNtf.json", json: {} }]);
    expect(await disconnectPhone(up.impl)).toMatchObject({ ok: true });
    expect(new URLSearchParams(up.calls[0].body!).get("VoiceUrl")).toBe(PREV.voice_url);
    expect(await ownTwilioConfig()).toBeNull();
  });

  it("never keeps Practice-OS voicemail as the old setting when she reconnects a number already on it", async () => {
    const { turnOnTwilioVoicemail, undoTwilioVoicemail, disconnectPhone } = await import("../lib/frontdesk/connect");
    const echo = { voice_url: voicemailUrl("Hi"), voice_method: "GET" };
    await connectTwilio({ accountSid: SID, authToken: TOKEN }, fakeFetch([list, { match: "GET IncomingPhoneNumbers/PNtf.json", json: echo }]).impl);
    expect(await ownTwilioConfig()).toMatchObject({ voicemailOn: true, previousVoiceUrl: null });
    // Turning it on again (a new greeting) still keeps no echo address as "previous".
    await turnOnTwilioVoicemail(fakeFetch([{ match: "POST IncomingPhoneNumbers/PNtf.json", json: {} }]).impl);
    expect((await ownTwilioConfig())?.previousVoiceUrl).toBeNull();
    const undo = fakeFetch([{ match: "POST IncomingPhoneNumbers/PNtf.json", json: {} }]);
    await undoTwilioVoicemail(undo.impl);
    expect(new URLSearchParams(undo.calls[0].body!).get("VoiceUrl")).toBe("");
    await disconnectPhone(fakeFetch([]).impl);
  });

  it("keeps nothing and changes nothing when Twilio refuses the change", async () => {
    const { turnOnTwilioVoicemail, disconnectPhone } = await import("../lib/frontdesk/connect");
    await connectTwilio({ accountSid: SID, authToken: TOKEN }, fakeFetch([list, { match: "GET IncomingPhoneNumbers/PNtf.json", json: PREV }]).impl);
    const refused = fakeFetch([{ match: "GET IncomingPhoneNumbers/PNtf.json", json: PREV }, { match: "POST IncomingPhoneNumbers/PNtf.json", status: 500, json: {} }]);
    expect(await turnOnTwilioVoicemail(refused.impl)).toMatchObject({ ok: false });
    const after = await ownTwilioConfig();
    expect(after?.voicemailOn).toBe(false);
    expect(after?.previousVoiceUrl).toBeUndefined();
    await disconnectPhone(fakeFetch([]).impl);
  });
});

describe("phone route", () => {
  const body = JSON.stringify({ vendor: "twilio", accountSid: SID, authToken: TOKEN });
  const req = (method: string, headers: Record<string, string>) =>
    new Request("http://127.0.0.1:3000/api/front-desk/phone", { method, headers: { "content-type": "application/json", ...headers }, body: method === "POST" ? body : undefined });

  it("refuses any request that isn't from the app on her own computer, for every phone company", async () => {
    const { POST, DELETE } = await import("../app/api/front-desk/phone/route");
    const foreign = { host: "practice-os.vercel.app", origin: "https://practice-os.vercel.app" };
    const crossSite = { host: "127.0.0.1:3000", "sec-fetch-site": "cross-site" };
    for (const h of [foreign, crossSite]) {
      expect((await POST(req("POST", h))).status).toBe(403);
      expect((await DELETE(req("DELETE", h))).status).toBe(403);
    }
    const spruce = new Request("http://127.0.0.1:3000/api/front-desk/phone", {
      method: "POST",
      headers: { "content-type": "application/json", ...crossSite },
      body: JSON.stringify({ vendor: "spruce", token: "x".repeat(20) }),
    });
    expect((await POST(spruce)).status).toBe(403);
  });

  it("still refuses on the Vercel copy, even with the admin password", async () => {
    const { POST } = await import("../app/api/front-desk/phone/route");
    const saved = { ...process.env };
    process.env.VERCEL = "1";
    process.env.ADMIN_PASSWORD = "admin-pass";
    try {
      const r = req("POST", { host: "practice-os.vercel.app", "sec-fetch-site": "same-origin", "x-admin-password": "admin-pass", cookie: "admin=admin-pass" });
      expect((await POST(r)).status).toBe(403);
    } finally {
      process.env = saved;
    }
  });
});
