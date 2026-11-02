import { describe, expect, it, vi } from "vitest";
import { DANA } from "./media-fixtures";

vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/media/facts", async (orig) => ({ ...(await orig<typeof import("../lib/media/facts")>()), loadMediaFacts: vi.fn(async () => DANA) }));
const saveStep = vi.hoisted(() => vi.fn(async (f: unknown) => f));
const reached = vi.hoisted(() => ({ any: false }));
vi.mock("../lib/media/pt-profile", async (orig) => {
  const real = await orig<typeof import("../lib/media/pt-profile")>();
  return { ...real, saveStep, stepNotAnswerable: (f: never, step: string) => (reached.any ? null : real.stepNotAnswerable(f, step)) };
});

import { TOOLS_BY_NAME } from "../lib/aeon/tools";

const run = async (input: Record<string, unknown>, said?: string[]) => {
  const r = await TOOLS_BY_NAME.get("pt_profile_interview")!.run(input as never, { by: "clinician", said } as never);
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

describe("pt_profile_interview: only her own typed words are saved", () => {
  it("refuses a school or language the model wrote that isn't in her latest message", async () => {
    reached.any = true;
    try {
      saveStep.mockClear();
      const school = await run({ step: "education", answer: "MA, Harvard University, 2015" }, ["I went to DePaul"]);
      expect(school.refused).toBe("I can only save an answer in your own words. Please type it here exactly as it should read, or fill it in on the Media page.");
      const lang = await run({ step: "languages", answer: "Mandarin" }, ["Spanish"]);
      expect(lang.refused).toMatch(/your own words/);
      expect(saveStep).not.toHaveBeenCalled();
      await run({ step: "education", answer: "MA, Clinical Mental Health Counseling, DePaul University, 2019" }, ["MA, Clinical Mental Health Counseling, DePaul University, 2019"]);
      expect(saveStep).toHaveBeenCalledWith(DANA, "education", { value: "MA, Clinical Mental Health Counseling, DePaul University, 2019" });
    } finally {
      reached.any = false;
    }
  });
});

describe("pt_profile_interview: confirm, info and one-choice steps aren't checked against her words", () => {
  it("takes a confirm passed as the string \"true\" (the recorded chat does this) after she says yes", async () => {
    saveStep.mockClear();
    const out = await run({ step: "header", answer: "true" }, ["Yes, that's right"]);
    expect(out.refused).toBeUndefined();
    expect(saveStep).toHaveBeenCalledWith(DANA, "header", { value: "true" });
  });

  it("takes a listed one-choice value without it being in her message", async () => {
    reached.any = true;
    try {
      saveStep.mockClear();
      const out = await run({ step: "availability", answer: "accepting" }, ["Yep, I am"]);
      expect(out.refused).toBeUndefined();
      expect(saveStep).toHaveBeenCalledWith(DANA, "availability", { value: "accepting" });
    } finally {
      reached.any = false;
    }
  });

  it("still refuses a number she didn't say", async () => {
    reached.any = true;
    try {
      saveStep.mockClear();
      const out = await run({ step: "yearsInPractice", answer: 12 }, ["about six years"]);
      expect(out.refused).toMatch(/your own words/);
      expect(saveStep).not.toHaveBeenCalled();
    } finally {
      reached.any = false;
    }
  });
});
