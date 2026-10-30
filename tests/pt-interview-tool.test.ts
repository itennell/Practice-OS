import { describe, expect, it, vi } from "vitest";
import { DANA } from "./media-fixtures";

vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/media/facts", async (orig) => ({ ...(await orig<typeof import("../lib/media/facts")>()), loadMediaFacts: vi.fn(async () => DANA) }));
const saveStep = vi.hoisted(() => vi.fn(async (f: unknown) => f));
vi.mock("../lib/media/pt-profile", async (orig) => ({ ...(await orig<typeof import("../lib/media/pt-profile")>()), saveStep }));

import { TOOLS_BY_NAME } from "../lib/aeon/tools";

const run = async (input: Record<string, unknown>) => {
  const r = await TOOLS_BY_NAME.get("pt_profile_interview")!.run(input as never, { by: "clinician" } as never);
  return JSON.parse((r.content[0] as { text: string }).text);
};

describe("pt_profile_interview step check", () => {
  it("refuses an answer for a step she hasn't reached", async () => {
    saveStep.mockClear();
    const out = await run({ step: "therapyTypes", answer: ["Gottman Method"] });
    expect(out.refused).toMatch(/isn't the question we're on/);
    expect(out.question.step).toBe("header");
    expect(saveStep).not.toHaveBeenCalled();
  });

  it("refuses a made-up step id", async () => {
    const out = await run({ step: "nope", skip: true });
    expect(out.refused).toMatch(/isn't part of the profile/);
    expect(saveStep).not.toHaveBeenCalled();
  });

  it("takes an answer for the current step", async () => {
    await run({ step: "header", answer: true });
    expect(saveStep).toHaveBeenCalledWith(DANA, "header", { value: null });
  });
});
