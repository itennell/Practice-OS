// Front Desk plain code: the reply parser, the client text templates (HB 1806),
// slot picking, time zones, phone numbers and the Twilio signature check.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { candidateSlots, pickThree } from "../lib/frontdesk/calendar/slots";
import { slotLabel, zonedTime } from "../lib/frontdesk/calendar/zone";
import { vetExtraction } from "../lib/frontdesk/extract";
import { prettyPhone, toE164 } from "../lib/frontdesk/phone/numbers";
import { isValidTwilioSignature, twilioSignature } from "../lib/frontdesk/phone/twilio-signature";
import { parseReply } from "../lib/frontdesk/reply";
import * as T from "../lib/frontdesk/templates";
import { checkCrisis } from "../lib/safety";

describe("parseReply", () => {
  it.each([
    ["2", 2], [" 2 ", 2], ["#2", 2], ["2.", 2], ["option 2", 2], ["2 please", 2], ["two", 2], ["the second one", 2], ["2nd works", 2], ["Number 3", 3], ["1", 1],
  ])("%j picks time %i", (text, index) => {
    expect(parseReply(text)).toEqual({ kind: "choice", index });
  });

  it("refuses a number that wasn't offered", () => {
    expect(parseReply("3", 2)).toEqual({ kind: "other" });
    expect(parseReply("4")).toEqual({ kind: "other" });
    expect(parseReply("0")).toEqual({ kind: "other" });
  });

  it.each(["STOP", "stop", "Unsubscribe", "cancel", "CANCEL", "quit", "end", "stop all"])("%j is an opt-out", (t) => {
    expect(parseReply(t)).toEqual({ kind: "stop" });
  });

  it("C or cancel my consult cancels a consult; R reschedules; BOOK asks for times", () => {
    expect(parseReply("C")).toEqual({ kind: "cancel" });
    expect(parseReply("cancel my appointment")).toEqual({ kind: "cancel" });
    expect(parseReply("R")).toEqual({ kind: "reschedule" });
    expect(parseReply("reschedule")).toEqual({ kind: "reschedule" });
    expect(parseReply("book")).toEqual({ kind: "book" });
    expect(parseReply("START")).toEqual({ kind: "start" });
    expect(parseReply("help")).toEqual({ kind: "help" });
  });

  it("anything else is other, including sentences that contain a number", () => {
    for (const t of ["Do you take BCBS?", "I can do 2 or 3", "my number is 312 555 0144", "", "  "]) {
      expect(parseReply(t).kind).toBe("other");
    }
  });
});

describe("client text templates", () => {
  const p = { practiceName: "[Sample] Reyes Counseling", clinicianFirstName: "Dana" };
  const labels = ["Tue Nov 3, 10:00 am", "Wed Nov 4, 2:00 pm", "Thu Nov 5, 4:00 pm"];
  const all = [
    T.consultOptionsText(p, labels, { firstContact: true, name: "Sam", purpose: "book" }),
    T.consultOptionsText(p, labels, { firstContact: false, purpose: "reschedule" }),
    T.noTimesText(p, true),
    T.bookedText(p, labels[1], "FD-1042"),
    T.rescheduledText(p, labels[1], "FD-1042"),
    T.cancelledText(p, "FD-1042"),
    T.slotTakenText(),
    T.reminderText(p, labels[1], "FD-1042"),
    T.passedOnText(p, true),
    T.pickHelpText(3),
    T.noBookingText(),
    T.stopText(p),
    T.helpText(p),
  ];

  it("says it is an AI assistant on first contact", () => {
    expect(all[0]).toBe(
      "Hi Sam, this is the AI assistant for [Sample] Reyes Counseling. Open consult times: 1) Tue Nov 3, 10:00 am 2) Wed Nov 4, 2:00 pm 3) Thu Nov 6, 4:00 pm. Reply 1, 2 or 3. Reply STOP to opt out.".replace("Thu Nov 6", "Thu Nov 5"),
    );
    expect(T.passedOnText(p, true)).toContain("AI assistant");
    expect(T.passedOnText(p, false)).not.toContain("AI assistant");
  });

  it("never uses empathy or advice phrases (HB 1806) and stays short", () => {
    const banned = /sorry to hear|understand how|must be hard|feel|feeling|support you|here for you|take care|hope you|you deserve|it's okay|be gentle/i;
    for (const t of all) {
      expect(t).not.toMatch(banned);
      expect(t.length).toBeLessThanOrEqual(320);
      expect(checkCrisis(t).crisis && t !== T.helpText(p)).toBe(false);
    }
  });

  it("the crisis alert never quotes the caller", () => {
    expect(T.crisisAlertText("sms", "+13125550144")).toBe(
      "URGENT from Practice-OS Front Desk: a text from +13125550144 mentioned danger or self-harm. The caller got the 988/911 message. Please check Front Desk now.",
    );
  });
});

describe("slots and time zones", () => {
  const tz = "America/Chicago";

  it("zonedTime handles standard and daylight time", () => {
    expect(zonedTime(2026, 11, 4, 14, 0, tz).toISOString()).toBe("2026-11-04T20:00:00.000Z"); // CST
    expect(zonedTime(2026, 10, 28, 14, 0, tz).toISOString()).toBe("2026-10-28T19:00:00.000Z"); // CDT
    expect(slotLabel(new Date("2026-11-04T20:00:00Z"), tz)).toBe("Wed, Nov 4, 2:00 pm");
  });

  it("pickThree prefers three different days and skips the next two hours", () => {
    const now = new Date("2026-11-03T15:00:00Z");
    const s = (iso: string) => ({ start: new Date(iso), end: new Date(new Date(iso).getTime() + 900_000) });
    const picked = pickThree([s("2026-11-03T16:00:00Z"), s("2026-11-03T18:00:00Z"), s("2026-11-03T19:00:00Z"), s("2026-11-04T15:00:00Z"), s("2026-11-05T15:00:00Z")], now, tz);
    expect(picked.map((p) => p.start.toISOString())).toEqual(["2026-11-03T18:00:00.000Z", "2026-11-04T15:00:00.000Z", "2026-11-05T15:00:00.000Z"]);
  });

  it("candidateSlots keeps to her open weekdays and 9 to 5", () => {
    const slots = candidateSlots(new Date("2026-11-06T00:00:00Z"), new Date("2026-11-10T00:00:00Z"), { weekdays: [1, 2, 3, 4], startHour: 9, endHour: 17 }, tz);
    const days = new Set(slots.map((s) => s.start.toISOString().slice(0, 10)));
    expect([...days]).toEqual(["2026-11-09"]); // Fri 6, Sat 7, Sun 8 closed
    expect(slots[0].start.toISOString()).toBe("2026-11-09T15:00:00.000Z");
    expect(slots.at(-1)!.start.toISOString()).toBe("2026-11-09T22:30:00.000Z");
  });
});

describe("phone numbers and extraction checks", () => {
  it("normalizes US numbers to E.164", () => {
    expect(toE164("(312) 555-0144")).toBe("+13125550144");
    expect(toE164("1 312 555 0144")).toBe("+13125550144");
    expect(toE164("555-0144")).toBeNull();
    expect(toE164("+44 20 7946 0000")).toBeNull();
    expect(prettyPhone("+13125550144")).toBe("(312) 555-0144");
  });

  it("vetExtraction keeps only clean values and falls back to caller ID", () => {
    expect(vetExtraction({ name: "Sam", callback_number: "312 555 0199", intent: "book", summary: "Wants a first consult" }, "+13125550144")).toEqual({
      name: "Sam", callbackNumber: "+13125550199", intent: "book", summary: "Wants a first consult",
    });
    expect(vetExtraction({ name: "<script>", callback_number: "12", intent: "diagnose", summary: 5 }, "+13125550144")).toEqual({
      name: null, callbackNumber: "+13125550144", intent: "other", summary: "Voicemail",
    });
    expect(vetExtraction(null, null)).toMatchObject({ name: null, callbackNumber: null, intent: "other" });
  });
});

describe("Twilio signature", () => {
  const url = "https://relay.example.test/twilio/voice";
  const params = { CallSid: "CA_fake", From: "+13125550144", To: "+13125550100" };
  it("accepts Twilio's own signature and rejects tampering", () => {
    const sig = twilioSignature("tok_fake", url, params);
    expect(isValidTwilioSignature("tok_fake", sig, url, params)).toBe(true);
    expect(isValidTwilioSignature("tok_fake", sig, url, { ...params, From: "+13125550000" })).toBe(false);
    expect(isValidTwilioSignature("other", sig, url, params)).toBe(false);
    expect(isValidTwilioSignature("tok_fake", null, url, params)).toBe(false);
  });
  it("signs the URL plus every parameter sorted by name, as Twilio documents", () => {
    // twilio.com/docs/usage/webhooks/webhooks-security: HMAC-SHA1(auth token, url + sorted key+value pairs), base64.
    const docParams = { To: "+18005551212", CallSid: "CA1234567890ABCDE", Digits: "1234", From: "+12349013030", Caller: "+12349013030" };
    const base = "https://mycompany.com/myapp.php?foo=1&bar=2" + "CallSidCA1234567890ABCDE" + "Caller+12349013030" + "Digits1234" + "From+12349013030" + "To+18005551212";
    expect(twilioSignature("12345", "https://mycompany.com/myapp.php?foo=1&bar=2", docParams)).toBe(createHmac("sha1", "12345").update(base).digest("base64"));
  });
});
