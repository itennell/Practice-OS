import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));

import type { MediaFacts } from "../lib/media/facts";
import { blocks, lintDesignation, lintText, readingGrade } from "../lib/media/lint";
import { assemble, cardPreview, directoryVersions, draftProfile, fitTo, templateFields, type ChatFn } from "../lib/media/profile";
import { HOOK_CHARS, LIMIT, TEXT_IDS } from "../lib/media/schema";

const DANA: MediaFacts = {
  name: "Dana Reyes",
  credential: "LCPC",
  practiceName: "Reyes Counseling PLLC",
  neighborhood: "Lincoln Park",
  city: "Chicago",
  state: "IL",
  address: { street: "2400 N Example Ave, Suite 2", city: "Chicago", state: "IL", zip: "60614" },
  phone: "312-555-0142",
  email: "dana@example.com",
  telehealth: true,
  fees: [{ label: "90834 Psychotherapy, 45 min", cents: 15000 }],
  insurers: ["Blue Cross Blue Shield of Illinois", "Aetna"],
  inNetwork: ["Blue Cross Blue Shield of Illinois"],
  whoIHelp: "Adults; Couples",
  website: null,
  websiteStatus: "wants",
  isSample: true,
  answers: {
    focus: "Anxiety, big life changes, and couples who feel stuck",
    approach: "Talk therapy with practical tools, and CBT when it fits",
    firstSession: "We talk about what brought you in and what you hope will change",
    why: "I like helping people feel at home in their own lives",
    languages: "Spanish",
    yearsInPractice: 6,
    freeConsultMinutes: 15,
  },
};

const BAD = [
  "My clients say I changed their life. ★★★★★",
  "One of my clients came to me after a breakup.",
  "Guaranteed results in just 6 sessions.",
  "I'm the best therapist in Chicago.",
  "As featured in the Tribune.",
  "You should try deep breathing when you feel anxious.",
  "If you feel suicidal, I can help.",
  "License number 180.015641.",
  "My fee is $95.",
  "I'm a Licensed Clinical Social Worker.",
  "I have 20 years in practice.",
  "I'm in network with Cigna.",
  "Book a free 30-minute consultation.",
];

function chatReturning(...bodies: Record<string, string>[]): ChatFn {
  let i = 0;
  return vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(bodies[Math.min(i++, bodies.length - 1)]) } }] })) as unknown as ChatFn;
}

const allBad = () => Object.fromEntries(TEXT_IDS.map((id, i) => [id, BAD[i % BAD.length]]));
const tooLong = () => Object.fromEntries(TEXT_IDS.map((id) => [id, "This box goes on and on".repeat(60)]));

describe("lint", () => {
  it.each(BAD)("blocks: %s", (t) => {
    expect(blocks(lintText(t, DANA))).toBe(true);
  });

  it("passes plain practice facts", () => {
    const ok = "I see adults and couples in Lincoln Park, Chicago, and online in IL. My fee is $150 for a session. You can book a free 15-minute call.";
    expect(lintText(ok, DANA).filter((f) => f.severity === "block")).toEqual([]);
  });

  it("flags over-limit text", () => {
    expect(lintText("x".repeat(141), DANA, { limit: 140 }).map((f) => f.rule)).toContain("too_long");
  });

  it("needs her license title somewhere", () => {
    expect(lintDesignation(["I'm Dana."], DANA)?.rule).toBe("designation");
    expect(lintDesignation(["I'm Dana Reyes, LCPC."], DANA)).toBeNull();
  });

  it("scores reading grade", () => {
    expect(readingGrade("I see adults. I like my work.")).toBeLessThan(4);
  });
});

describe("profile drafts", () => {
  it("fitTo never cuts mid-sentence", () => {
    expect(fitTo("One. Two two two.", 10)).toBe("One.");
    expect(fitTo("no sentence end here at all", 10)).toBe("");
  });

  it("templates fit every limit and pass the lint", () => {
    const t = templateFields(DANA);
    for (const id of TEXT_IDS) {
      expect(t[id].length, id).toBeLessThanOrEqual(LIMIT[id]);
      expect(lintText(t[id], DANA).filter((f) => f.severity === "block"), id).toEqual([]);
    }
  });

  it.each([
    ["rule-breaking", allBad],
    ["over-long", tooLong],
  ])("every field fits and is clean even when Muse writes %s boxes", async (_, body) => {
    const d = await draftProfile(DANA, { chat: chatReturning(body(), body()) });
    expect(d.fields).toHaveLength(TEXT_IDS.length);
    for (const f of d.fields) {
      expect(f.text.length, f.id).toBeLessThanOrEqual(f.limit);
      expect(blocks(f.findings), f.id).toBe(false);
      for (const bad of BAD) expect(f.text).not.toContain(bad);
    }
    expect(d.profileFindings).toEqual([]);
    expect(d.source).toBe("template");
  });

  it("keeps good Muse boxes and retries once", async () => {
    const good = { ...templateFields(DANA), statement_help: "Looking for help with anxiety or a big life change? I'm Dana Reyes, LCPC, and I see adults and couples in Lincoln Park." };
    const chat = chatReturning({ ...good, intro: BAD[0] }, good);
    const d = await draftProfile(DANA, { chat });
    expect(chat).toHaveBeenCalledTimes(2);
    expect(d.fields.find((f) => f.id === "statement_help")!.from).toBe("aeon");
    expect(d.source).toBe("muse");
  });

  it("uses the templates without a key", async () => {
    const d = await draftProfile(DANA, { hasKey: false });
    expect(d.source).toBe("template");
    expect(d.cardPreview.length).toBeLessThanOrEqual(HOOK_CHARS + 1);
    expect(d.picks.map((p) => p.id)).toContain("fees");
  });

  it("puts in the designation when Muse leaves it out", () => {
    const tpl = templateFields(DANA);
    const noTitle = Object.fromEntries(TEXT_IDS.map((id) => [id, tpl[id].replace(/,? LCPC/g, "").replace(/ \(LCPC\)/, "").replace("Licensed Clinical Professional Counselor", "counselor")]));
    const { fields } = assemble(DANA, noTitle);
    expect(lintDesignation(fields.map((f) => f.text), DANA)).toBeNull();
  });

  it("card preview cuts at a word", () => {
    const p = cardPreview("word ".repeat(80));
    expect(p.endsWith("…")).toBe(true);
    expect(p.length).toBeLessThanOrEqual(HOOK_CHARS + 1);
  });

  it("google version has no prices and fits 750", async () => {
    const d = await draftProfile(DANA, { hasKey: false });
    const g = directoryVersions(d).find((x) => x.id === "google")!;
    expect(g.text.length).toBeLessThanOrEqual(750);
    expect(g.text).not.toMatch(/\$\d/);
  });
});

describe("website", async () => {
  const { assemblePages, draftSite, jsonLd, templatePages, PAGE_LIMIT } = await import("../lib/media/website");

  it("template pages fit and pass the lint", () => {
    const t = templatePages(DANA);
    for (const [id, text] of Object.entries(t)) expect(text.length, id).toBeLessThanOrEqual(PAGE_LIMIT[id as keyof typeof PAGE_LIMIT]);
    for (const p of assemblePages(DANA, null)) expect(blocks(p.findings), p.id).toBe(false);
  });

  it("drops a Muse page that loses the 988 line or breaks a rule", async () => {
    const t = templatePages(DANA);
    const chat = chatReturning({ ...t, contact: "Call me any time.", home: "Best therapist in Chicago!" });
    const site = await draftSite(DANA, { chat });
    expect(site.pages.find((p) => p.id === "contact")!.from).toBe("template");
    expect(site.pages.find((p) => p.id === "home")!.from).toBe("template");
    expect(site.pages.find((p) => p.id === "about")!.from).toBe("aeon");
  });

  it("JSON-LD is MedicalBusiness with no reviews", () => {
    const ld = jsonLd(DANA);
    const data = JSON.parse(ld.replace(/<\/?script[^>]*>/g, ""));
    expect(data["@type"]).toBe("MedicalBusiness");
    expect(data.address.postalCode).toBe("60614");
    expect(ld).not.toMatch(/review|rating/i);
  });
});
