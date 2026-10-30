// What Muse may read of a caller's message: numbers, emails, dates and names
// blanked by plain code and the local name-finder; name and number kept here.
import { describe, expect, it, vi } from "vitest";
import { blankDetails, maskForModel, selfName, spokenNumber, UnmaskableError } from "../lib/frontdesk/mask";
import { blankContacts } from "../lib/frontdesk/redact";

const fakeNames = async (t: string) => (t.includes("Riley Park") ? ["Riley Park"] : []);

describe("masking a caller's words before Muse", () => {
  it("keeps the number and first name in plain code and blanks them in the text", async () => {
    const m = await maskForModel("Hi, this is Sam. Call me back at (312) 555-0144 or sam@example.com about a consult.", fakeNames);
    expect(m.name).toBe("Sam");
    expect(m.callbackNumber).toBe("+13125550144");
    expect(m.text).toBe("Hi, this is [name]. Call me back at [number] or [email] about a consult.");
  });

  it("blanks names the name-finder sees, dates and long digit runs", async () => {
    const m = await maskForModel("Calling for Riley Park, born 4/12/1990, member 123456789.", fakeNames);
    expect(m.text).toBe("Calling for [name], born [date], member [number].");
  });

  it("fails closed when the name-finder can't load", async () => {
    await expect(maskForModel("Hi, this is Sam", () => Promise.reject(new Error("model missing")))).rejects.toThrow();
  });

  it("reads a self-given name and the first spoken number", () => {
    expect(selfName("Hi it's Jordan, calling about times")).toBe("Jordan");
    expect(selfName("Hi, just calling to book")).toBeNull();
    expect(spokenNumber("reach me at 312.555.0101 thanks")).toBe("+13125550101");
  });
});

describe("readIntent sends Muse only masked words", () => {
  it("never passes the number or name to the model", async () => {
    vi.resetModules();
    vi.doMock("../lib/aeon/phi-classifier", () => ({ findNames: async () => [] }));
    const seen: string[] = [];
    vi.doMock("../lib/meta", () => ({
      chat: async (_f: string, body: { messages: { content: string }[] }) => {
        seen.push(body.messages[1].content);
        return { choices: [{ message: { content: JSON.stringify({ name: "X", callback_number: "3125559999", intent: "book", summary: "Wants a consult" }) } }] };
      },
    }));
    const { readIntent } = await import("../lib/frontdesk/extract");
    const x = await readIntent("Hi, this is Sam, call me at 312 555 0144 to book a consult", "+13125550100");
    expect(seen).toEqual(["Hi, this is [name], call me at [number] to book a consult"]);
    expect(x).toMatchObject({ name: "Sam", callbackNumber: "+13125550144", intent: "book" });
    vi.doUnmock("../lib/aeon/phi-classifier");
    vi.doUnmock("../lib/meta");
  });
});

describe("spoken details (plain code)", () => {
  const none = async () => [];

  it("blanks digits read out one by one", async () => {
    const m = await maskForModel("Hi, call me back at three one two, five five five, oh one four four, to book a consult.", none);
    expect(m.text).toBe("Hi, call me back at [number], to book a consult.");
  });

  it("blanks spoken dates, dates with month names, and spoken years", async () => {
    expect((await maskForModel("I was born March third, nineteen ninety. I'd like a consult.", none)).text).toBe("I was born [date]. I'd like a consult.");
    expect((await maskForModel("Born on the 4th of July 1990, want to book.", none)).text).toBe("Born on [date], want to book.");
    expect((await maskForModel("Since two thousand five I have wanted to book.", none)).text).toBe("Since [date] I have wanted to book.");
  });

  it("never sends an email read aloud to Muse", async () => {
    await expect(maskForModel("Email me at sam dot reyes at gmail dot com please", none)).rejects.toBeInstanceOf(UnmaskableError);
    await expect(maskForModel("You can reach me at sam at yahoo", none)).rejects.toBeInstanceOf(UnmaskableError);
  });

  it("falls back when digit or date words are left over after masking", () => {
    expect(() => blankDetails("my number is three, uh, one two, um, five five")).toThrow(UnmaskableError);
    expect(() => blankDetails("born in March, on the uh third")).toThrow(UnmaskableError);
  });

  it("leaves ordinary booking words alone", () => {
    const t = "Hi, this is a sample caller. I'd like to book a first consult, maybe one evening next week. May I come in?";
    expect(blankDetails(t)).toBe(t);
  });

  it("readIntent uses keywords, not Muse, when a spoken email is present", async () => {
    vi.resetModules();
    vi.doMock("../lib/aeon/phi-classifier", () => ({ findNames: async () => [] }));
    const chat = vi.fn();
    vi.doMock("../lib/meta", () => ({ chat }));
    const { readIntent } = await import("../lib/frontdesk/extract");
    const x = await readIntent("I want to book a consult, email me at sam at gmail dot com", "+13125550100");
    expect(chat).not.toHaveBeenCalled();
    expect(x).toMatchObject({ intent: "book", summary: "Wants a first consult" });
    vi.doUnmock("../lib/aeon/phi-classifier");
    vi.doUnmock("../lib/meta");
  });
});

describe("what the Front Desk page shows of a caller's words", () => {
  it("masks phone numbers to the last four and blanks emails and spoken digits", () => {
    expect(blankContacts("Call me at (312) 555-0144 or sam@example.com")).toEqual({ text: "Call me at (•••) •••-0144 or [email]", hidden: true });
    expect(blankContacts("it's three one two five five five oh one four four").text).toBe("it's [number]");
    expect(blankContacts("Do you have evening hours?")).toEqual({ text: "Do you have evening hours?", hidden: false });
  });
});
