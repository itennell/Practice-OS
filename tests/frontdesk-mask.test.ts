// What Muse may read of a caller's message: numbers, emails, dates and names
// blanked by plain code and the local name-finder; name and number kept here.
import { describe, expect, it, vi } from "vitest";
import { maskForModel, selfName, spokenNumber } from "../lib/frontdesk/mask";

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
