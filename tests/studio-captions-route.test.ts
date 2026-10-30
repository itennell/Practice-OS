// Captions route (app/api/studio/[id]/captions): only a WAV of sound comes in;
// the words pass the crisis check and the client-detail guard before they go back.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  transcribe: vi.fn(),
  guard: vi.fn(),
  audit: vi.fn(),
  alertCrisis: vi.fn(),
}));

vi.mock("@/lib/meta", () => ({ transcribe: m.transcribe, transcriptText: (r: { transcript?: string }) => r.transcript ?? "" }));
vi.mock("@/lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: m.guard }));
vi.mock("@/lib/audit", () => ({ audit: m.audit }));
vi.mock("@/lib/safety", async (orig) => ({ ...(await orig<typeof import("../lib/safety")>()), alertCrisis: m.alertCrisis }));
vi.mock("@/lib/studio/store", () => ({ getProject: async (id: string) => (id === ID ? { id } : null) }));

import { POST } from "../app/api/studio/[id]/captions/route";
import { encodeWav } from "../components/shared/dictation-audio";
import { REFUSAL } from "../lib/aeon/guard";
import { CRISIS_REPLY } from "../lib/safety";

const ID = "11111111-2222-4333-8444-555555555555";

function post(id: string, opts: { audio?: Blob; start?: string; site?: string } = {}) {
  const form = new FormData();
  form.append("audio", opts.audio ?? new Blob([encodeWav(new Float32Array(2400).fill(0.1), 24_000)], { type: "audio/wav" }), "piece.wav");
  form.append("start", opts.start ?? "4");
  const req = new Request("http://127.0.0.1:3000/api/studio/" + id + "/captions", {
    method: "POST",
    headers: { host: "127.0.0.1:3000", "sec-fetch-site": opts.site ?? "same-origin" },
    body: form,
  });
  return POST(req, { params: Promise.resolve({ id }) } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  m.guard.mockImplementation(async (text: string) => ({ ok: true, text }));
});

describe("captions route", () => {
  it("turns a piece of sound into words", async () => {
    m.transcribe.mockResolvedValue({ transcript: "Book a free call from the link" });
    const res = await POST_ok();
    expect(await res.json()).toEqual({ text: "Book a free call from the link" });
    expect(m.transcribe).toHaveBeenCalledWith("studio_captions", expect.stringMatching(/practice-os-captions-.*\.wav/), { mode: "PUSH_TO_TALK" });
  });

  it("refuses another website, an unknown video, and anything that is not a WAV", async () => {
    expect((await post(ID, { site: "cross-site" })).status).toBe(403);
    expect((await post("not-a-uuid")).status).toBe(404);
    expect((await post("99999999-2222-4333-8444-555555555555")).status).toBe(404);
    expect((await post(ID, { audio: new Blob([new Uint8Array(100)]) })).status).toBe(415);
    expect((await post(ID, { start: "nope" })).status).toBe(400);
    expect(m.transcribe).not.toHaveBeenCalled();
  });

  it("a crisis in the sound gets the fixed reply, an alert and no caption", async () => {
    m.transcribe.mockResolvedValue({ transcript: "sometimes I want to kill myself" });
    const res = await post(ID);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: CRISIS_REPLY, hardStop: true });
    expect(m.alertCrisis).toHaveBeenCalledWith(expect.objectContaining({ source: "media" }));
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "crisis_reply", subjectId: ID }));
    expect(m.guard).not.toHaveBeenCalled();
  });

  it("a client detail is refused with the guard words and no caption", async () => {
    m.transcribe.mockResolvedValue({ transcript: "words with a client detail" });
    m.guard.mockResolvedValue({ ok: false, kind: "unavailable" });
    const res = await post(ID);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: REFUSAL.unavailable });
    expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "phi_refused" }));
  });
});

async function POST_ok() {
  const res = await post(ID);
  expect(res.status).toBe(200);
  return res;
}
