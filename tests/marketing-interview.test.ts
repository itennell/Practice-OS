// Onboarding's marketing interview (chapter 6): how clients find her decides what
// follows, Instagram branches three ways ("Not for me" skips the rest), her website
// branches the same way, and every word reads at about a 6th-grade level.
import { describe, expect, it } from "vitest";
import { flatten, QUESTIONS, teamDefaults, type Ctx } from "@/lib/onboarding/chapters";
import { normalizeWebsite } from "@/lib/onboarding/store";
import { ACCOUNT_STEPS, instagramQuestions, parsePrefs } from "@/lib/instagram/onboarding";
import { FALLBACK_SAMPLES, sampleOk, STYLES, writeStyleSamples } from "@/lib/instagram/style";
import { voiceLines, type PracticeFacts } from "@/lib/instagram/write";
import type { ChatFn } from "@/lib/instagram/critic";

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
  findClients: [],
  website: null,
  instagram: null,
};
const basics = { state: "IL", credential: "LCPC" as const, practiceStage: "beginning" as const, officeZip: "60614", telehealth: true };

/** The chapter 6 screens she'd see, given her answers so far. */
function tools(c: Partial<Ctx> = {}, ig: Record<string, unknown> = {}) {
  return flatten({ ...base, ...c }, { helpers: [instagramQuestions], basics, mine: { instagram: ig } })
    .filter((s) => s.chapter === "tools")
    .map((s) => s.id);
}

describe("the marketing interview", () => {
  it("opens on how clients find her, then asks about Instagram before anything else", () => {
    expect(tools().slice(0, 3)).toEqual(["find_clients", "instagram:account", "website"]);
  });

  it("Yes: connect now or later, then the post questions", () => {
    expect(tools({}, { account: "has" })).toEqual([
      "find_clients",
      "instagram:account",
      "instagram:connect",
      "instagram:goals",
      "instagram:topics",
      "instagram:posts_per_week",
      "instagram:never_show",
      "instagram:style",
      "website",
      "connect",
      "uses_texting",
    ]);
  });

  it("I'd like one: the step-by-step guide instead of Connect", () => {
    const ids = tools({}, { account: "wants" });
    expect(ids).toContain("instagram:guide");
    expect(ids).not.toContain("instagram:connect");
    expect(ids).toContain("instagram:style");
  });

  it("Not for me: no more Instagram screens, and no Instagram card on Connect your tools", () => {
    const screens = flatten({ ...base, instagram: "no" }, { helpers: [instagramQuestions], basics, mine: { instagram: { account: "no" } } });
    expect(screens.filter((s) => s.id.startsWith("instagram:")).map((s) => s.id)).toEqual(["instagram:account"]);
    expect(screens.find((s) => s.id === "connect")?.hide).toEqual(["instagram"]);
    expect(screens.find((s) => s.id === "team")?.defaults?.instagram).toBe(false);
  });

  it("website: picking 'My website' goes straight to the address; 'I'd like one' becomes a later task", () => {
    expect(tools({ findClients: ["website"] })).toContain("website_url");
    expect(tools({ findClients: ["website"] })).not.toContain("website");
    expect(tools({ website: "has" })).toContain("website_url");
    expect(tools({ website: "wants" })).not.toContain("website_url");
    expect(tools({ website: "no" })).not.toContain("website_url");
    expect(QUESTIONS.find((q) => q.id === "website")?.later).toEqual({ when: "wants", ask: "Make a practice website" });
  });

  it("her answers decide which helpers start", () => {
    expect(teamDefaults({ stage: "late", findClients: [], instagram: null })).toMatchObject({ referrals: false, instagram: false });
    expect(teamDefaults({ stage: "late", findClients: ["doctors"], instagram: "wants" })).toMatchObject({ referrals: true, instagram: true });
    expect(teamDefaults({ stage: "middle", findClients: [], instagram: "no" })).toMatchObject({ instagram: false, admin: true });
  });

  it("checks her website address", () => {
    expect(normalizeWebsite("reyescounseling.com")).toBe("https://reyescounseling.com");
    expect(normalizeWebsite("https://www.ReyesCounseling.com/about/")).toBe("https://www.reyescounseling.com/about");
    expect(normalizeWebsite("my site")).toBeNull();
    expect(normalizeWebsite("javascript:alert(1)")).toBeNull();
    expect(normalizeWebsite("localhost")).toBeNull();
  });

  it("checks Instagram answers in plain words", () => {
    expect(parsePrefs({ never_show: ["face", "none"] }).neverShow).toEqual(["face"]);
    expect(() => parsePrefs({ account: "maybe" })).toThrow(/one of the three/);
    expect(() => parsePrefs({ style: { pick: "funny" } })).toThrow(/one of the three/);
    expect(() => parsePrefs({ style: { pick: "warm", example: "x".repeat(601) } })).toThrow(/600/);
    expect(parsePrefs({ style: { pick: "", example: "Book any time." } })).toMatchObject({ style: null, example: "Book any time." });
  });
});

describe("her post style", () => {
  const facts: PracticeFacts = {
    clinicianName: "Dana Reyes",
    credential: "LCPC",
    practiceName: "Reyes Counseling PLLC",
    neighborhood: "Lincoln Park",
    city: "Chicago",
    licenseLine: "Dana Reyes, LCPC (fictional demo practice)",
    fees: [{ label: "Session", cents: 17500 }],
  };

  it("the fixed samples pass the post rules", () => {
    expect(FALLBACK_SAMPLES.map((s) => s.id)).toEqual(STYLES.map((s) => s.id));
    for (const s of FALLBACK_SAMPLES) expect(sampleOk(s.text, facts), s.id).toBe(true);
  });

  it("uses Muse's three when they pass, and the fixed three when one breaks a rule", async () => {
    const reply = (obj: unknown) => (async () => ({ choices: [{ message: { content: JSON.stringify(obj) } }] })) as unknown as ChatFn;
    const good = {
      warm: "Booking is easy. Start with a free 15-minute call, and we'll find a time that fits your week. The link is in my bio.",
      plain: "To book, tap the link in my bio. Pick a time for a free 15-minute call. Then we set up your first visit.",
      professional: "New clients may schedule a free 15-minute consultation through the link in our bio. We will then arrange your first appointment.",
    };
    expect(await writeStyleSamples(facts, { hasKey: true, chat: reply(good) })).toMatchObject({ source: "muse" });
    const bad = { ...good, warm: "Feeling anxious? Try deep breathing, then book a free call through the link in my bio today." };
    expect(await writeStyleSamples(facts, { hasKey: true, chat: reply(bad) })).toEqual({ samples: FALLBACK_SAMPLES, source: "fallback" });
    expect(await writeStyleSamples(facts, { hasKey: false })).toMatchObject({ source: "fallback" });
  });

  it("drafts follow her pick, goals and limits", () => {
    const lines = voiceLines({ style: "professional", example: "", goals: ["Fill my open spots"], neverShow: ["family"] }).join("\n");
    expect(lines).toMatch(/calm and professional/);
    expect(lines).toMatch(/Fill my open spots/);
    expect(lines).toMatch(/her family/);
    expect(voiceLines(undefined).join(" ")).toMatch(/warmly and plainly/);
  });
});

// The same Flesch-Kincaid grade as tests/onboarding-readability.test.ts.
function syllables(word: string): number {
  let w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, w.match(/[aeiouy]{1,2}/g)?.length ?? 1);
}
function grade(text: string): number {
  const sentences = Math.max(1, text.match(/[.!?]+(\s|$)/g)?.length ?? 0);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences) + 11.8 * (syl / words.length) - 15.59;
}

describe("the marketing interview's reading level", () => {
  const ours = QUESTIONS.filter((q) => ["find_clients", "website", "website_url"].includes(q.id));
  const texts = [
    ...ours.flatMap((q) => [q.ask, q.help ?? "", q.aeonSays, ...(q.options ?? []).map((o) => o.label)]),
    ...instagramQuestions.questions.flatMap((q) => [
      q.ask,
      q.help ?? "",
      q.says ?? "",
      ...("options" in q ? q.options.map((o) => o.label) : []),
      ...(q.kind === "choices" && q.note ? [q.note.will, q.note.wont] : []),
    ]),
    ...ACCOUNT_STEPS,
    ...FALLBACK_SAMPLES.map((s) => s.text),
  ].filter(Boolean);

  it("reads at a 6th-grade level or easier overall", () => {
    expect(grade(texts.join(" "))).toBeLessThanOrEqual(6);
  });

  it("every question on its own is at a 6th-grade level or easier", () => {
    const asks = [...ours.map((q) => q.ask), ...instagramQuestions.questions.map((q) => q.ask)];
    expect(asks.filter((t) => grade(t.endsWith("?") ? t : `${t}.`) > 6)).toEqual([]);
  });
});
