// Front Desk plain code: the reply parser, the client text templates (HB 1806),
// slot picking, time zones, phone numbers and the Twilio signature check.
import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { candidateSlots, pickThree } from "../lib/frontdesk/calendar/slots";
import { shortSlotLabel, slotLabel, whenLabel, zonedTime } from "../lib/frontdesk/calendar/zone";
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
    expect(parseReply("YES")).toEqual({ kind: "start" });
    expect(parseReply("help")).toEqual({ kind: "help" });
  });

  it("anything else is other, including sentences that contain a number", () => {
    for (const t of ["Do you take BCBS?", "I can do 2 or 3", "my number is 312 555 0144", "", "  "]) {
      expect(parseReply(t).kind).toBe("other");
    }
  });
});

describe("client text templates (word for word with docs/sms-opt-in.md, the registered campaign)", () => {
  const p = { practiceName: "Reyes Counseling", clinicianFirstName: "Dana", consultMinutes: 15, demo: true };
  const labels = ["Tue 10am", "Wed 2pm", "Thu 4pm"];

  it("greeting, first text, confirmation, reminder and START/STOP/HELP match the registration", () => {
    expect(T.greetingText(p)).toBe(
      "Hi, this is Dana with Reyes Counseling. Please leave your name and number, and our AI assistant will text you times for a free consultation this week. Message and data rates may apply. Reply STOP to opt out.",
    );
    expect(T.consultOptionsText(p, labels, { firstContact: true, name: "Sam", purpose: "book" })).toBe(
      "Practice-OS demo: Hi Sam, this is the AI assistant for Reyes Counseling. Open consult times: 1) Tue 10am 2) Wed 2pm 3) Thu 4pm. Reply 1, 2 or 3 to book. Reply STOP to opt out.",
    );
    expect(T.startText(p)).toBe("Reyes Counseling: You'll get texts about booking a consultation. Msg & data rates may apply. Reply HELP for help, STOP to opt out.");
    expect(T.stopText(p)).toBe("Reyes Counseling: You're unsubscribed and won't get more texts. Reply START to resubscribe.");
    expect(T.helpText(p)).toBe(
      "Reyes Counseling scheduling texts. For help call the practice line. In an emergency call 911; call or text 988 for the Suicide and Crisis Lifeline. Reply STOP to opt out.",
    );
    // Registered as "Reply RESCHEDULE or CANCEL to change it."; CANCEL alone is a carrier opt-out word,
    // so the app says R and C until the registration is updated (flagged to the orchestrator 2026-10-28).
    expect(T.bookedText(p, "Wed at 2pm", "FD-1042")).toBe(
      "Reyes Counseling: You're booked for a free 15-minute phone consult Wed at 2pm (ref FD-1042). Reply R to reschedule or C to cancel. Reply STOP to opt out.",
    );
    expect(T.reminderText(p, "Wed at 2pm", "FD-1042")).toBe(
      "Reyes Counseling reminder: your free 15-minute phone consult is tomorrow, Wed at 2pm (ref FD-1042). Reply R to reschedule or C to cancel. Reply STOP to opt out.",
    );
  });

  it("drops the demo prefix outside the demo and the AI line after first contact", () => {
    expect(T.consultOptionsText({ ...p, demo: false }, labels, { firstContact: true, name: null, purpose: "book" })).toMatch(/^Hi, this is the AI assistant for Reyes Counseling\./);
    expect(T.passedOnText(p, true)).toContain("AI assistant");
    expect(T.passedOnText(p, false)).not.toContain("AI assistant");
  });

  const all = [
    T.greetingText(p),
    T.consultOptionsText(p, labels, { firstContact: true, name: "Sam", purpose: "book" }),
    T.consultOptionsText(p, labels, { firstContact: false, purpose: "reschedule" }),
    T.noTimesText(p, true),
    T.bookedText(p, "Wed at 2pm", "FD-1042"),
    T.rescheduledText(p, "Wed at 2pm", "FD-1042"),
    T.cancelledText(p, "FD-1042"),
    T.slotTakenText(p),
    T.reminderText(p, "Wed at 2pm", "FD-1042"),
    T.passedOnText(p, true),
    T.pickHelpText(p, 3),
    T.noBookingText(p),
    T.startText(p),
    T.stopText(p),
  ];

  it("never uses empathy or advice phrases (HB 1806) and stays short", () => {
    const banned = /sorry to hear|understand how|must be hard|feel|feeling|support you|here for you|take care|hope you|you deserve|it's okay|be gentle/i;
    for (const t of [...all, T.helpText(p)]) {
      expect(t).not.toMatch(banned);
      expect(t.length).toBeLessThanOrEqual(320);
    }
    for (const t of all) expect(checkCrisis(t).crisis).toBe(false);
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
    expect(shortSlotLabel(new Date("2026-11-04T20:00:00Z"), tz)).toBe("Wed 2pm");
    expect(shortSlotLabel(new Date("2026-11-03T16:30:00Z"), tz)).toBe("Tue 10:30am");
    expect(whenLabel(new Date("2026-11-04T20:00:00Z"), tz)).toBe("Wed at 2pm");
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
