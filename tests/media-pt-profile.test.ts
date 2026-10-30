import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/aeon/guard", () => ({
  // Stands in for the name finder: a client name, or a method name read as a person's.
  guard: vi.fn(async (t: string) =>
    /\bmy client (maria|john)\b|\bGottman\b/i.test(t) || /\bmy client [A-Z][a-z]+ [A-Z][a-z]+/.test(t) ? { ok: false, kind: "phi" } : { ok: true, text: t },
  ),
  REFUSAL: { phi: "Please leave out anything about a client." },
}));
const alertCrisis = vi.hoisted(() => vi.fn(async () => ({ alerted: true })));
vi.mock("../lib/safety", async (orig) => ({ ...(await orig<typeof import("../lib/safety")>()), alertCrisis }));

import { CRISIS_REPLY } from "../lib/safety";
import {
  buildProfileView,
  exportAll,
  interviewState,
  MAKE_IT_YOURS,
  maskMethods,
  previousStep,
  saveStep,
  SECTIONS,
  STEPS,
  stepNotAnswerable,
  validateStep,
  valueOf,
  STEP,
  WELCOME,
} from "../lib/media/pt-profile";
import { EMPTY_PT, parsePt } from "../lib/media/pt-answers";
import { HOOK_CHARS, PT_LISTS } from "../lib/media/schema";
import { DANA } from "./media-fixtures";

const ALL_SEEN = { ...DANA, pt: { ...DANA.pt, seen: STEPS.map((s) => s.id) } };
const FILLED = {
  ...DANA,
  pt: {
    ...DANA.pt,
    availability: "accepting" as const,
    sessionFormat: ["In Person", "Online"],
    paymentMethods: ["Cash", "Visa"],
    slidingScale: true,
    topSpecialties: ["Anxiety", "Life Transitions", "Relationship Issues"],
    expertise: ["Stress", "Anxiety"],
    ages: ["Adults"],
    participants: ["Individuals", "Couples"],
    therapyTypes: ["Cognitive Behavioral (CBT)", "Gottman Method"],
    nearby: "Lakeview, Old Town, 60657",
    seen: STEPS.map((s) => s.id),
  },
};

describe("PT interview steps", () => {
  it("walks the sections in the order a profile reads", () => {
    const order = SECTIONS.map((s) => s.id);
    const idx = STEPS.map((s) => order.indexOf(s.section));
    expect(idx.every((n, i) => n >= 0 && (i === 0 || n >= idx[i - 1]))).toBe(true);
    expect(new Set(STEPS.map((s) => s.section))).toEqual(new Set(order));
  });

  it("uses Psychology Today's pick-list wording for every chip step", () => {
    for (const s of STEPS) if (s.kind === "multi") expect(PT_LISTS[s.list].options.length).toBeGreaterThan(0);
    expect(PT_LISTS.specialties.options.some((o) => /suicid|self[- ]harm/i.test(o))).toBe(false);
  });

  it("greets her and starts at the header, then picks up where she left off", () => {
    const s = interviewState(DANA);
    expect(s.welcome).toBe(WELCOME);
    expect(s.step?.id).toBe("header");
    expect(s.step?.lines[0]).toBe("Dana Reyes, LCPC");
    const later = interviewState({ ...DANA, pt: { ...DANA.pt, seen: ["header", "focus"] } });
    expect(later.step?.id).toBe("firstSession");
    expect(interviewState(ALL_SEEN).done).toBe(true);
    expect(interviewState(ALL_SEEN, "ages").step?.id).toBe("ages");
    expect(previousStep("focus")).toBe("header");
  });

  it("fills in what Aeon already knows", () => {
    expect(valueOf(STEP.get("ages")!, DANA)).toEqual(["Adults"]);
    expect(valueOf(STEP.get("participants")!, DANA)).toEqual(["Individuals", "Couples"]);
    expect(valueOf(STEP.get("sessionFormat")!, DANA)).toEqual(["In Person", "Online"]);
    expect(valueOf(STEP.get("education")!, DANA)).toContain("Example University");
    expect(valueOf(STEP.get("focus")!, DANA)).toBe(DANA.answers.focus);
  });
});

describe("PT interview answers", () => {
  it("takes exactly 3 top specialties", async () => {
    await expect(validateStep("topSpecialties", ["Anxiety", "Stress"], DANA)).rejects.toThrow("exactly 3");
    await expect(validateStep("topSpecialties", ["Anxiety", "Stress", "Grief", "Divorce"], DANA)).rejects.toThrow("exactly 3");
    expect((await validateStep("topSpecialties", ["Anxiety", "Stress", "Grief"], DANA)).pt.topSpecialties).toEqual(["Anxiety", "Stress", "Grief"]);
  });

  it("keeps typed answers within their limit", async () => {
    await expect(validateStep("why", "x ".repeat(150), DANA)).rejects.toThrow("under 200");
    await expect(validateStep("nearby", "a".repeat(201), DANA)).rejects.toThrow("under 200");
  });

  it.each([
    ["why", "My clients say I changed their life."],
    ["focus", "One of my former clients came in with panic attacks."],
    ["approach", "I guarantee you will feel better in 6 sessions."],
    ["firstSession", "You should try breathing exercises before we meet."],
    ["extraCredentials", "Best therapist in Chicago"],
  ])("blocks %s: %s", async (id, text) => {
    await expect(validateStep(id, text, DANA)).rejects.toThrow();
  });

  it("blocks her own chip label when it breaks a rule", async () => {
    await expect(validateStep("expertise", ["Anxiety", "Clients say I'm amazing"], DANA)).rejects.toThrow(/testimonial/i);
    expect((await validateStep("expertise", ["Anxiety", "Burnout in nurses"], DANA)).pt.expertise).toContain("Burnout in nurses");
  });

  it("answers a crisis with the fixed reply and alerts her", async () => {
    await expect(validateStep("why", "Some days I want to kill myself", DANA)).rejects.toThrow(CRISIS_REPLY);
    expect(alertCrisis).toHaveBeenCalled();
  });

  it("doesn't mistake a method named after a person for a client's name", async () => {
    expect((await validateStep("extraCredentials", "Gottman Level 1 training, 2022", DANA)).pt.extraCredentials).toBe("Gottman Level 1 training, 2022");
  });

  it("refuses client details", async () => {
    await expect(validateStep("focus", "Helping my client Maria with her divorce", DANA)).rejects.toThrow("client");
  });

  it.each(["nearby", "education", "extraCredentials"])("refuses a client name that looks like a method word in %s", async (id) => {
    await expect(validateStep(id, "my client Christian Lopez", DANA)).rejects.toThrow("client");
  });

  it("refuses a client name typed as her own chip label", async () => {
    await expect(validateStep("expertise", ["Anxiety", "my client Christian Lopez"], DANA)).rejects.toThrow("client");
    await expect(validateStep("therapyTypes", ["my client Play Person"], DANA)).rejects.toThrow("client");
  });

  it("masks only whole method phrases, never single words", () => {
    expect(maskMethods("Christian Counseling and Gottman Method")).toBe("method and method");
    expect(maskMethods("my client Christian Lopez")).toBe("my client Christian Lopez");
    expect(maskMethods("Play with Person")).toBe("Play with Person");
  });

  it.each(["focus", "approach", "firstSession", "why"])("refuses an empty answer for %s", async (id) => {
    await expect(validateStep(id, "   ", DANA)).rejects.toThrow("type an answer");
  });

  it("still takes an empty answer for optional text", async () => {
    expect((await validateStep("nearby", "", DANA)).pt.nearby).toBe("");
  });

  it.each(["topSpecialties", "ages", "participants", "therapyTypes", "sessionFormat"])("won't skip %s", async (id) => {
    await expect(saveStep(DANA, id, { skip: true })).rejects.toThrow("can't be skipped");
    expect(interviewState(DANA, id).step?.required).toBe(true);
  });

  it("lets her skip an optional step", () => {
    expect(interviewState(DANA, "expertise").step?.required).toBe(false);
  });

  it("only lets the chat answer the step she's on, or one she already saw", () => {
    expect(stepNotAnswerable(DANA, "header")).toBeNull();
    expect(stepNotAnswerable(DANA, "therapyTypes")).toMatch(/isn't the question we're on/);
    expect(stepNotAnswerable(DANA, "made-up")).toMatch(/isn't part of the profile/);
    expect(stepNotAnswerable({ ...DANA, pt: { ...DANA.pt, seen: ["header", "focus"] } }, "focus")).toBeNull();
  });

  it("only accepts listed choices", async () => {
    await expect(validateStep("availability", "maybe", DANA)).rejects.toThrow("choices");
    expect((await validateStep("freeConsultMinutes", "20", DANA)).media.freeConsultMinutes).toBe(20);
    expect((await validateStep("slidingScale", "yes", DANA)).pt.slidingScale).toBe(true);
  });
});

describe("PT profile view and export", () => {
  const v = buildProfileView(FILLED, null);

  it("has every section, in order", () => {
    expect(v.sections.map((s) => s.id)).toEqual(SECTIONS.map((s) => s.id));
    for (const s of v.sections) expect(s.copy.length).toBeGreaterThan(0);
  });

  it("fills each section from her answers", () => {
    expect(v.glance.availability).toBe("Taking new clients");
    expect(v.glance.formatLine).toBe("In person and online sessions");
    expect(v.specialties.expertise).toEqual(["Stress"]);
    expect(v.sections.find((s) => s.id === "finances")!.copy).toContain("Payment methods: Cash, Visa");
    expect(v.sections.find((s) => s.id === "treatment")!.copy).toContain("Cognitive Behavioral (CBT)");
    expect(v.treatment.note.text).toContain("Gottman Method");
    expect(v.statement.snippet.length).toBeLessThanOrEqual(HOOK_CHARS + 1);
    expect(v.source).toBe("live");
  });

  it("quotes her regular session fee, not the intake fee", () => {
    const f = { ...FILLED, fees: [{ label: "First session (intake)", cents: 20000 }, { label: "Therapy, 38-52 minutes", cents: 15000 }] };
    expect(buildProfileView(f, null).glance.feeLine).toMatch(/^\$150 per session/);
  });

  it("never shows a license number or a made-up endorsement", () => {
    expect(v.qualifications.licenseLine).toBe("Licensed by the State of Illinois (LCPC)");
    expect(JSON.stringify(v)).not.toMatch(/\b\d{3}[.-]\d{6}\b/);
    expect(v.sections.find((s) => s.id === "endorsements")!.copy).toMatch(/Ask a colleague/);
  });

  it("copies the At a Glance rows the preview shows", () => {
    const glance = v.sections.find((s) => s.id === "glance")!.copy;
    expect(glance).toContain("I specialize in Anxiety, Life Transitions and Relationship Issues");
    expect(glance).toContain("I see: Individuals, Couples");
    expect(exportAll(v)).toContain("I specialize in Anxiety, Life Transitions and Relationship Issues");
    expect(v.exportText).toContain("I see: Individuals, Couples");
  });

  it("exports every section in order", () => {
    const all = exportAll(v);
    expect(all.startsWith("Psychology Today profile for Dana Reyes, LCPC (fictional demo practice)")).toBe(true);
    expect(all).toContain(MAKE_IT_YOURS);
    const at = SECTIONS.map((s) => all.indexOf(`${s.title.toUpperCase()}\n`));
    expect(at.every((n, i) => n > 0 && (i === 0 || n > at[i - 1]))).toBe(true);
  });
});

describe("PT answers parsing", () => {
  it("keeps the good answers when one field is bad", () => {
    const pt = parsePt({ topSpecialties: ["Anxiety", "Stress", "Grief"], nearby: "x".repeat(500), availability: "sometimes", ages: ["Adults"], junk: 1 });
    expect(pt.topSpecialties).toEqual(["Anxiety", "Stress", "Grief"]);
    expect(pt.ages).toEqual(["Adults"]);
    expect(pt.nearby).toBe(EMPTY_PT.nearby);
    expect(pt.availability).toBeNull();
    expect("junk" in pt).toBe(false);
  });

  it("starts empty from nothing", () => {
    expect(parsePt(null)).toEqual(EMPTY_PT);
    expect(parsePt("bad")).toEqual(EMPTY_PT);
  });
});
