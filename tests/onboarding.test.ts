import { describe, expect, it } from "vitest";
import {
  CHAPTERS,
  firstFor,
  flatten,
  checkEin,
  normalizeUsPhone,
  progressFor,
  QUESTIONS,
  timezoneFor,
  type Ctx,
} from "@/lib/onboarding/chapters";
import { acceptable, FALLBACK_FOLLOWUPS, writeFollowups } from "@/lib/onboarding/followups";

const base: Ctx = {
  state: "IL",
  credential: "LCPC",
  stage: "beginning",
  seesClients: "both",
  insurance: "self_pay",
  firstRenewal: false,
  medicare: "none",
  medicaid: null,
  officeZip: "60614",
};
const ids = (c: Ctx) => flatten(c).map((s) => s.id);

describe("onboarding chapters", () => {
  it("asks name, practice name, state and license first, so her profile can be saved", () => {
    expect(ids(base).slice(0, 4)).toEqual(["name", "practice_name", "state", "license"]);
  });

  it("keeps the 8 chapters in order and every question in one of them", () => {
    const order = CHAPTERS.map((c) => c.id);
    const seen = flatten(base).map((s) => order.indexOf(s.chapter));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });

  it("never asks for a license number, SSN or birth date", () => {
    for (const q of QUESTIONS) expect(`${q.ask} ${q.help ?? ""}`).not.toMatch(/license number\?|social security number\?|date of birth|birthday/i);
  });

  it("leaves out questions that don't apply", () => {
    const il = ids(base);
    expect(il).toContain("adults_26");
    expect(il).not.toContain("psypact");
    expect(il).not.toContain("payers");
    expect(il).not.toContain("caqh");

    const ohioPsych = ids({ ...base, state: "OH", credential: "Psychologist", insurance: "some", medicaid: true });
    expect(ohioPsych).not.toContain("adults_26");
    expect(ohioPsych).toContain("psypact");
    expect(ohioPsych).not.toContain("qualified_examiner"); // Illinois only
    expect(ohioPsych).toContain("payers");
    expect(flatten({ ...base, state: "OH", insurance: "some" }).find((s) => s.id === "medicaid")?.dateAsk).toBeUndefined(); // IMPACT is Illinois only
    expect(flatten({ ...base, insurance: "some" }).find((s) => s.id === "medicaid")?.dateAsk).toMatch(/IMPACT/);
  });

  it("stays at 25 to 35 questions for typical practices", () => {
    for (const c of [base, { ...base, insurance: "some" as const, medicare: "enrolled" as const, medicaid: true }, { ...base, state: "TX", credential: "LMFT" as const }])  {
      const n = flatten(c).length;
      expect(n).toBeGreaterThanOrEqual(25);
      expect(n).toBeLessThanOrEqual(35);
    }
    // The longest case: an Illinois psychologist who takes insurance gets two psychologist-only questions.
    expect(flatten({ ...base, credential: "Psychologist", insurance: "some", medicare: "enrolled", medicaid: true }).length).toBeLessThanOrEqual(36);
  });

  it("fills in her license type", () => {
    expect(flatten(base).find((s) => s.id === "license_expires")?.ask).toBe("When does your LCPC license expire?");
  });

  it("counts progress inside the current chapter only", () => {
    const screens = flatten(base);
    const i = screens.findIndex((s) => s.id === "license_expires");
    expect(progressFor(screens, i)).toMatchObject({ chapter: "license", chapterNumber: 2, at: 1 });
    expect(progressFor(screens, i).of).toBe(screens.filter((s) => s.chapter === "license").length);
  });

  it("slots each helper's questions after the texting question, skipping ones that don't apply", () => {
    const screens = flatten(base, {
      helpers: [
        {
          helper: "referrals",
          questions: [
            { id: "zip", kind: "zip", ask: "What ZIP is your office in?", appliesWhen: (b) => !b.officeZip },
            { id: "who", kind: "choices", multi: true, ask: "Who would you like to hear from?", options: [{ value: "pcp", label: "Family medicine" }] },
          ],
        },
      ],
      basics: { state: "IL", credential: "LCPC", practiceStage: "beginning", officeZip: "60614", telehealth: true },
    });
    const at = screens.findIndex((s) => s.id === "uses_texting");
    expect(screens[at + 1].id).toBe("referrals:who");
    expect(screens.some((s) => s.id === "referrals:zip")).toBe(false);
  });

  it("hands the browser plain data only, even when a helper uses appliesWhen", () => {
    const screens = flatten(base, {
      helpers: [
        {
          helper: "front_desk",
          questions: [{ id: "minutes", kind: "number", ask: "How long is a consult?", appliesWhen: (b) => b.state === "IL" }],
        },
      ],
      basics: { state: "IL", credential: "LCPC", practiceStage: "beginning", officeZip: "60614", telehealth: true },
    });
    const functions: string[] = [];
    const walk = (v: unknown, path: string) => {
      if (typeof v === "function") functions.push(path);
      else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
    };
    walk(screens, "screens");
    expect(functions).toEqual([]); // React refuses to send a function to a client component
    expect(screens.find((s) => s.id === "front_desk:minutes")?.helper?.question.ask).toBe("How long is a consult?");
    expect(() => structuredClone(screens)).not.toThrow();
  });

  it("drops another session's screen in as one entry (the Muse key step)", () => {
    const screens = flatten(base, {
      extra: [{ after: "name", screen: { id: "muse-key", chapter: "you", kind: "slot", ask: "Connect Aeon's brain", aeonSays: "…" } }],
    });
    expect(screens.map((s) => s.id).slice(0, 3)).toEqual(["name", "muse-key", "practice_name"]);
  });

  it("starts the right helpers for each stage", () => {
    expect(firstFor("beginning").helpers).toEqual(["admin", "referrals"]);
    expect(firstFor("middle").helpers).toEqual(["referrals", "instagram", "front_desk"]);
    expect(firstFor("late").helpers).toEqual(["front_desk", "admin"]);
  });

  it("reads phone numbers and tax IDs the way people type them", () => {
    expect(normalizeUsPhone("(312) 555-0100")).toBe("+13125550100");
    expect(normalizeUsPhone("1 312 555 0100")).toBe("+13125550100");
    expect(normalizeUsPhone("555-0100")).toBeNull();
    expect(checkEin("12-3456789")).toEqual({ ok: true, ein: "12-3456789" });
    expect(checkEin("123-45-6789")).toEqual({ ok: false, reason: "ssn" }); // never stored
    expect(checkEin("123 45 6789")).toEqual({ ok: false, reason: "ssn" });
    expect(checkEin("123456789")).toEqual({ ok: false, reason: "shape" }); // could be either
    expect(checkEin("12-345")).toEqual({ ok: false, reason: "shape" });
  });

  it("guesses the time zone from the state", () => {
    expect(timezoneFor("IL")).toBe("America/Chicago");
    expect(timezoneFor("CA")).toBe("America/Los_Angeles");
    expect(timezoneFor(null)).toBe("America/Chicago");
  });
});

describe("Muse follow-up questions", () => {
  it("lets through plain business questions only", () => {
    expect(acceptable({ question: "Do you offer a sliding scale for some clients?", topic: "fees_billing" })).toBe(true);
    expect(acceptable({ question: "What symptoms do your clients usually have?", topic: "referrals" })).toBe(false);
    expect(acceptable({ question: "Which diagnosis codes do you bill most?", topic: "fees_billing" })).toBe(false);
    expect(acceptable({ question: "No question mark here", topic: "schedule" })).toBe(false);
    expect(acceptable({ question: "Do you like Tuesdays?", topic: "not_a_topic" })).toBe(false);
  });

  it("uses the fixed questions without a Muse key", async () => {
    const out = await writeFollowups("Adults with work stress, telehealth", { hasKey: false });
    expect(out).toEqual({ questions: FALLBACK_FOLLOWUPS, source: "fallback" });
  });

  it("never sends a crisis message to Muse", async () => {
    let called = false;
    const out = await writeFollowups("I want to kill myself", {
      hasKey: true,
      chat: (async () => {
        called = true;
        throw new Error("should not run");
      }) as never,
    });
    expect(called).toBe(false);
    expect(out.source).toBe("fallback");
  });
});
