// "Simulate a voicemail" accepts only the sample kinds the test console defines:
// an inherited name like "constructor" or any unknown kind is refused with 400.
import { beforeEach, describe, expect, it, vi } from "vitest";

const simulateVoicemail = vi.fn(async (kind: string) => ({ inquiryId: "x", outcome: kind, usedSampleCalendar: true }));
vi.mock("../lib/frontdesk/test-console", () => ({
  SAMPLE_TRANSCRIPTS: { booking: "b", crisis: "c" },
  simulateVoicemail: (k: string) => simulateVoicemail(k),
}));

const { POST } = await import("../app/api/front-desk/simulate/route");
const post = (body: unknown) =>
  POST(new Request("http://localhost/api/front-desk/simulate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

beforeEach(() => simulateVoicemail.mockClear());

describe("POST /api/front-desk/simulate", () => {
  it.each(["constructor", "toString", "__proto__", "hasOwnProperty", "nope", 7, null])("refuses %s", async (kind) => {
    const res = await post({ kind });
    expect(res.status).toBe(400);
    expect(simulateVoicemail).not.toHaveBeenCalled();
  });

  it("runs a known kind", async () => {
    const res = await post({ kind: "crisis" });
    expect(res.status).toBe(200);
    expect(simulateVoicemail).toHaveBeenCalledWith("crisis");
  });

  it("runs the booking sample when no kind is given", async () => {
    expect((await post({})).status).toBe(200);
    expect(simulateVoicemail).toHaveBeenCalledWith("booking");
  });
});
