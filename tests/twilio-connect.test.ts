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
