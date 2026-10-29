// Front Desk adapters against provider responses shaped from each API reference
// (tests/fixtures/frontdesk/responses.ts). No network.
import { describe, expect, it } from "vitest";
import { calcomAdapter } from "../lib/frontdesk/calendar/calcom";
import { googleAdapter, googleEventId } from "../lib/frontdesk/calendar/google";
import { spruceAdapter } from "../lib/frontdesk/phone/spruce";
import { twilioAdapter, twilioFromEnv } from "../lib/frontdesk/phone/twilio";
import { calcom, google, spruce, twilio } from "./fixtures/frontdesk/responses";
import { fakeFetch } from "./helpers/fake-fetch";

const SINCE = new Date("2026-10-28T21:00:00Z");

describe("Twilio dev adapter", () => {
  const cfg = { accountSid: "AC_fake", authToken: "tok_fake", phoneNumber: "+13125550100" };
  const routes = [
    { match: "GET /IncomingPhoneNumbers.json", json: twilio.numbers },
    { match: "GET /Recordings.json", json: twilio.recordings },
    { match: "GET /Calls/CA_fake_1.json", json: twilio.call1 },
    { match: "GET /Recordings/RE_fake_new.wav", body: Buffer.from("RIFF0000WAVEfmt "), headers: { "content-type": "audio/wav" } },
    { match: "GET /Messages.json", json: twilio.messages },
    { match: "POST /Messages.json", json: twilio.sent },
  ];

  it("lists only finished recordings since the cursor, with the caller's number", async () => {
    const f = fakeFetch(routes);
    const vms = await twilioAdapter(cfg, f.impl).listVoicemails(SINCE);
    expect(vms.map((v) => [v.id, v.from])).toEqual([["RE_fake_new", "+13125550144"]]);
    const audio = await vms[0].audio();
    expect(audio.mime).toBe("audio/wav");
    expect(f.calls[0].headers.authorization).toBe(`Basic ${Buffer.from("AC_fake:tok_fake").toString("base64")}`);
  });

  it("lists inbound texts only and sends from the practice number", async () => {
    const f = fakeFetch(routes);
    const a = twilioAdapter(cfg, f.impl);
    expect((await a.listInboundTexts(SINCE)).map((t) => [t.id, t.from, t.body])).toEqual([["SM_fake_in", "+13125550144", "2"]]);
    expect(await a.sendText("+13125550144", "hi")).toEqual({ id: "SM_fake_sent" });
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(new URLSearchParams(post.body ?? "").get("From")).toBe("+13125550100");
  });

  it("check() gives a plain fix when the keys are wrong", async () => {
    const f = fakeFetch([{ match: "GET /IncomingPhoneNumbers.json", status: 401, json: {} }]);
    const out = await twilioAdapter(cfg, f.impl).check();
    expect(out).toEqual({ ok: false, fix: expect.stringContaining("TWILIO_AUTH_TOKEN") });
  });

  it("is only switched on by FRONT_DESK_DEV_TWILIO=true with all three keys", () => {
    const env = { TWILIO_ACCOUNT_SID: "AC", TWILIO_AUTH_TOKEN: "t", TWILIO_PHONE_NUMBER: "(312) 555-0100" };
    expect(twilioFromEnv(env as never)).toBeNull();
    expect(twilioFromEnv({ ...env, FRONT_DESK_DEV_TWILIO: "true" } as never)).toEqual({ accountSid: "AC", authToken: "t", phoneNumber: "+13125550100" });
  });
});

describe("Spruce adapter", () => {
  const routes = [
    { match: "GET /internalendpoints", json: spruce.internalEndpoints },
    { match: "GET /conversations/t_phone/items", json: spruce.items },
    { match: "GET /conversations?", json: spruce.conversations },
    { match: "GET /transcriptions/tr_1", json: spruce.transcription },
    { match: "GET https://media.example.test/vm.mp3", body: Buffer.from("ID3fake"), headers: { "content-type": "audio/mpeg" } },
    { match: "POST /internalendpoints/ep_line/conversations", json: spruce.sent },
  ];

  it("finds the voicemail with Spruce's transcript and the inbound text, skipping notes and secure chats", async () => {
    const f = fakeFetch(routes);
    const a = spruceAdapter({ token: "sk_fake" }, f.impl);
    const vms = await a.listVoicemails(SINCE);
    expect(vms).toHaveLength(1);
    expect(vms[0]).toMatchObject({ id: "ti_vm", from: "+13125550144", providerTranscript: expect.stringContaining("Sam") });
    expect((await vms[0].audio()).mime).toBe("audio/mpeg");
    const texts = await a.listInboundTexts(SINCE);
    expect(texts.map((t) => [t.id, t.body])).toEqual([["ti_sms", "2"]]);
    // one scan serves both lists
    expect(f.calls.filter((c) => c.url.includes("/conversations?")).length).toBe(1);
    expect(f.calls.find((c) => c.url.includes("/conversations?"))!.url).toContain("orderBy=last_message");
    expect(f.calls[0].headers.authorization).toBe("Bearer sk_fake");
  });

  it("sends a text from her phone line to the caller's number", async () => {
    const f = fakeFetch(routes);
    expect(await spruceAdapter({ token: "sk_fake" }, f.impl).sendText("+13125550144", "hello")).toEqual({ id: "asyncRequest_fake" });
    const post = f.calls.find((c) => c.method === "POST")!;
    expect(JSON.parse(post.body!)).toEqual({ destination: { smsOrEmailEndpoint: "+13125550144" }, message: { body: [{ type: "text", value: "hello" }] } });
    expect(post.headers["s-idempotency-key"]).toBeTruthy();
  });

  it("check() shows the line, or a plain fix when Support hasn't turned the API on", async () => {
    expect(await spruceAdapter({ token: "sk" }, fakeFetch(routes).impl).check()).toEqual({ ok: true, label: "Connected: (312) 555-0100 (Spruce)" });
    const denied = await spruceAdapter({ token: "sk" }, fakeFetch([{ match: "GET /internalendpoints", status: 403, json: {} }]).impl).check();
    expect(denied).toEqual({ ok: false, fix: expect.stringContaining("Spruce Support") });
  });
});

describe("Cal.com adapter", () => {
  const cfg = { apiKey: "cal_fake", eventTypeId: 42, timeZone: "America/Chicago" };
  const routes = [
    { match: "GET /event-types", json: calcom.eventTypes },
    { match: "GET /slots?", json: calcom.slots },
    { match: "POST /bookings/bk_fake_1/reschedule", json: calcom.rescheduled },
    { match: "POST /bookings/bk_fake_2/cancel", json: calcom.cancelled },
    { match: "POST /bookings", json: calcom.booking },
  ];

  it("reads slots across days with the pinned API version", async () => {
    const f = fakeFetch(routes);
    const slots = await calcomAdapter(cfg, f.impl).openSlots(new Date("2026-11-03T00:00:00Z"), new Date("2026-11-05T00:00:00Z"));
    expect(slots.map((s) => s.start.toISOString())).toEqual(["2026-11-03T16:00:00.000Z", "2026-11-04T20:00:00.000Z", "2026-11-04T21:00:00.000Z"]);
    expect(f.calls[0].headers["cal-api-version"]).toBe("2024-09-04");
    expect(f.calls[0].url).toContain("eventTypeId=42");
  });

  it("books with the reference only, never the caller's name", async () => {
    const f = fakeFetch(routes);
    const slot = { start: new Date("2026-11-04T20:00:00Z"), end: new Date("2026-11-04T20:15:00Z") };
    expect(await calcomAdapter(cfg, f.impl).book(slot, "FD-1042")).toEqual({ externalId: "bk_fake_1" });
    const post = f.calls.find((c) => c.method === "POST")!;
    const body = JSON.parse(post.body!);
    expect(body.attendee.name).toBe("Phone consult FD-1042");
    expect(body.attendee.email).toBeUndefined();
    expect(post.headers["cal-api-version"]).toBe("2026-02-25");
  });

  it("isFree re-reads the slots; reschedule returns the new uid; cancel posts a reason", async () => {
    const f = fakeFetch(routes);
    const a = calcomAdapter(cfg, f.impl);
    expect(await a.isFree({ start: new Date("2026-11-04T20:00:00Z"), end: new Date("2026-11-04T20:15:00Z") })).toBe(true);
    expect(await a.isFree({ start: new Date("2026-11-04T22:00:00Z"), end: new Date("2026-11-04T22:15:00Z") })).toBe(false);
    expect(await a.reschedule("bk_fake_1", { start: new Date("2026-11-05T20:00:00Z"), end: new Date("2026-11-05T20:15:00Z") })).toEqual({ externalId: "bk_fake_2" });
    await a.cancel("bk_fake_2");
    expect(f.calls.at(-1)!.url).toContain("/bookings/bk_fake_2/cancel");
  });

  it("check() names the event type, or asks her to pick it again", async () => {
    expect((await calcomAdapter(cfg, fakeFetch(routes).impl).check()).ok).toBe(true);
    expect(await calcomAdapter({ ...cfg, eventTypeId: 9 }, fakeFetch(routes).impl).check()).toEqual({ ok: false, fix: expect.stringContaining("Pick it again") });
  });
});

describe("Google Calendar adapter", () => {
  const routes = [
    { match: "POST /freeBusy", json: google.freeBusy },
    { match: "POST /calendars/primary/events", json: google.event },
    { match: "PATCH /calendars/primary/events/", json: google.event },
    { match: "DELETE /calendars/primary/events/", status: 204, body: "" },
  ];
  const cfg = { getToken: async () => "ya29.fake", timeZone: "America/Chicago" };

  it("offers her office hours minus busy times", async () => {
    const f = fakeFetch(routes);
    // Tue Nov 3 2026, Chicago (UTC-6): 9:00 to 11:00 local is busy.
    const slots = await googleAdapter(cfg, f.impl).openSlots(new Date("2026-11-03T15:00:00Z"), new Date("2026-11-03T23:00:00Z"));
    const starts = slots.map((s) => s.start.toISOString());
    expect(starts[0]).toBe("2026-11-03T17:00:00.000Z"); // 11:00 am local, first free
    expect(starts).not.toContain("2026-11-03T15:00:00.000Z");
    expect(slots.every((s) => s.end.getTime() - s.start.getTime() === 15 * 60_000)).toBe(true);
    expect(f.calls[0].headers.authorization).toBe("Bearer ya29.fake");
  });

  it("books with the reference only and a valid Google event id", async () => {
    const f = fakeFetch(routes);
    const slot = { start: new Date("2026-11-03T18:00:00Z"), end: new Date("2026-11-03T18:15:00Z") };
    await googleAdapter(cfg, f.impl).book(slot, "FD-1042");
    const body = JSON.parse(f.calls[0].body!);
    expect(body.summary).toBe("Phone consult FD-1042");
    expect(body.attendees).toBeUndefined();
    expect(body.id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(googleEventId("FD-1042")).toMatch(/^[a-v0-9]+$/);
  });

  it("isFree says no when the slot overlaps a busy block", async () => {
    const a = googleAdapter(cfg, fakeFetch(routes).impl);
    expect(await a.isFree({ start: new Date("2026-11-03T16:00:00Z"), end: new Date("2026-11-03T16:15:00Z") })).toBe(false);
  });
});
