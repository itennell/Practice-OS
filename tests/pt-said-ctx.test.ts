// Item 5 of the PR #123 review: Psychology Today answers come from her own words, so the chat
// must hand her messages to the tool (ctx.said), and only typed steps are checked against them.
import { describe, expect, it, vi } from "vitest";

vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/compliance/store", () => ({ practiceToday: vi.fn(async () => "2026-11-02") }));
vi.mock("../lib/aeon/memory", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/memory")>()), relevantMemories: vi.fn(async () => []) }));
vi.mock("../lib/profile", async (orig) => ({ ...(await orig<typeof import("../lib/profile")>()), getProfile: vi.fn(async () => null) }));
vi.mock("../lib/aeon/guard", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/guard")>()), guard: vi.fn(async (text: string) => ({ ok: true, text })) }));
const runTool = vi.hoisted(() => vi.fn(async () => ({ content: [{ type: "text" as const, text: "{}" }] })));
vi.mock("../lib/aeon/tools", async (orig) => ({ ...(await orig<typeof import("../lib/aeon/tools")>()), runTool }));

import { respond } from "../lib/aeon/agent";
import { TYPED_STEPS } from "../lib/aeon/tools";

describe("the chat passes her words to the tool", () => {
  it("gives runTool her earlier messages and her current one, last", async () => {
    const replies = [
      { choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "pt_profile_interview", arguments: '{"step":"focus","answer":"Anxiety"}' } }] } }] },
      { choices: [{ message: { role: "assistant", content: "Saved." } }] },
    ];
    const chat = vi.fn(async () => replies.shift()) as never;
    await respond("Anxiety", {
      by: "chat:test",
      chat,
      history: [
        { role: "clinician", content: "Set up my Psychology Today profile" },
        { role: "aeon", content: "What do people most often come to you for?" },
      ] as never,
    });
    expect(runTool).toHaveBeenCalledTimes(1);
    const [name, args, ctx] = runTool.mock.calls[0] as unknown as [string, unknown, { said?: string[] }];
    expect(name).toBe("pt_profile_interview");
    expect(args).toEqual({ step: "focus", answer: "Anxiety" });
    expect(ctx.said).toEqual(["Set up my Psychology Today profile", "Anxiety"]);
  });
});

describe("only typed steps are checked against her words", () => {
  it("checks text, number and pick-many; not confirm, info or one-choice", () => {
    expect([...TYPED_STEPS].sort()).toEqual(["multi", "number", "text"]);
    for (const k of ["confirm", "info", "choice"]) expect(TYPED_STEPS.has(k)).toBe(false);
  });
});
