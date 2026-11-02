// PR #123 review fixes: the narrowed truth checks must never let a wrong public claim
// through (exemptions only for the exact true phrasing), plans she hasn't applied to never
// appear, the model can't write her PT answers, refusals and the crisis reply read plainly,
// and a waiting post is edited by default. Fixtures only, no model calls.
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/aeon/guard", () => ({ guard: vi.fn(async (t: string) => ({ ok: true, text: t })), REFUSAL: {} }));

import { DANA } from "./media-fixtures";
import { factProblems, factSheet, fixInNetwork, truthOf } from "../lib/media/truth";
import { honestReply, refusalOf, type Attempt } from "../lib/aeon/agent";
import { notInHerWords, TOOLS_BY_NAME } from "../lib/aeon/tools";
import { looksLikeEditSignal, looksLikeNewTopic } from "../lib/instagram/revise";
import { avoidLine } from "../lib/studio/regenerate";
import { CRISIS_REPLY } from "../lib/safety";

// Aetna approved, BCBSIL applied and waiting, no free consult.
const FACTS = {
  ...DANA,
  fees: [
    { label: "Therapy, 38-52 minutes", cents: 15000 },
    { label: "Therapy, 53 minutes or longer", cents: 17500 },
  ],
  insurers: ["BCBSIL", "Aetna"],
  inNetwork: ["Aetna"],
  answers: { ...DANA.answers, freeConsultMinutes: 0 as const, consultAsked: true },
};
const T = truthOf(FACTS);
const kinds = (t: string, truth = T) => factProblems(t, truth).map((p) => p.kind);
const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });

describe("1. 'no insurance' claims while she's in network with Aetna", () => {
  it.each(["We're out of network with everyone.", "I'm out of network for Aetna.", "We're not in network with anyone.", "Private pay only, Aetna included."])("blocks %s", (s) => {
    expect(kinds(s)).toContain("insurance_claim");
  });
  it.each(["For plans other than Aetna, I'm out of network.", "Except for Aetna, I'm out of network.", "Besides Aetna, I'm out of network.", "Private pay or Aetna."])("passes the scoped wording %s", (s) => {
    expect(kinds(s)).toEqual([]);
  });
});

describe("2. per-session superbills", () => {
  it.each(["You get a superbill each session.", "Superbills every session.", "I give you a superbill with every session.", "A superbill with every session."])("blocks %s", (s) => {
    expect(kinds(s)).toContain("superbill");
  });
  it.each(["A superbill lists each session you paid for.", "A superbill shows every session and its fee.", "The superbill has each session's date and code.", "A superbill includes every visit."])("passes %s", (s) => {
    expect(kinds(s)).toEqual([]);
  });
});

describe("3. a free consult she doesn't offer", () => {
  it.each(["Book a free initial consult.", "Book a free discovery call.", "Ask for a free intake call."])("blocks %s", (s) => {
    expect(kinds(s)).toContain("consult");
  });
  it("passes 'feel free to call'", () => {
    expect(kinds("Feel free to call with questions.")).toEqual([]);
  });
  it("catches a 30-minute discovery call when she offers 15", () => {
    const fifteen = truthOf({ ...FACTS, answers: { ...FACTS.answers, freeConsultMinutes: 15 } });
    expect(factProblems("Book a 30-minute discovery call.", fifteen).map((p) => p.message)).toContain("offers a 30-minute consult");
  });
});

describe("4. a plan she hasn't applied to never appears", () => {
  // loadMediaFacts keeps approved and applied/pending/follow_up only; Cigna (not_started) isn't in insurers.
  it("'In network with Cigna' is left for the check to name, never turned into 'applying'", () => {
    expect(fixInNetwork("In network with Cigna.", T)).toBe("In network with Cigna.");
    expect(kinds("In network with Cigna.")).toContain("insurer");
    expect(fixInNetwork("In network with BCBSIL.", T)).toBe("Applying to be in network with BCBSIL.");
  });
  it("the fact sheet says applied-and-waiting, and never names a plan she's only preparing", () => {
    const line = factSheet(T).find((l) => l.startsWith("- Insurance:"))!;
    expect(line).toContain("Applied to BCBSIL and waiting: not in network yet.");
    expect(line).toContain("Never name a plan she is only preparing to apply to.");
  });
});

describe("5. the model can't write her Psychology Today answers", () => {
  it("pt_profile_interview is no longer one of the tools that always run", async () => {
    const t = TOOLS_BY_NAME.get("pt_profile_interview")!;
    expect(t).toBeTruthy();
    const src = (await import("node:fs")).readFileSync(new URL("../lib/aeon/tools.ts", import.meta.url), "utf8");
    expect(src.match(/const ALWAYS_RUNS = new Set\(\[([^\]]*)\]/)![1]).not.toContain("pt_profile_interview");
  });
  it("an answer must appear in her latest message", () => {
    const opts = [{ value: "Spanish", label: "Spanish" }];
    expect(notInHerWords("MA, Harvard", [], "I went to DePaul")).toMatch(/your own words/);
    expect(notInHerWords("MA, Clinical Mental Health Counseling, DePaul University, 2019", [], "ma clinical mental health counseling depaul university 2019")).toBeNull();
    expect(notInHerWords(["Mandarin"], opts, "Spanish")).toMatch(/your own words/);
    expect(notInHerWords(["Spanish"], opts, "yes that one")).toBeNull(); // a listed choice
    expect(notInHerWords(true, [], "")).toBeNull();
    expect(notInHerWords("Talk therapy", [], undefined)).toMatch(/your own words/);
  });
});

describe("7. Regenerate avoids the flagged claims, not the stale headline", () => {
  it("builds the avoid line from the flags", () => {
    expect(avoidLine(["It says you don't take insurance, but you're in network with Aetna.", "It says when superbills go out; you give them on request."])).toBe(
      "avoid: says you don't take insurance, but you're in network with Aetna; says when superbills go out; you give them on request",
    );
  });
});

describe("9. refusals mixed with other outcomes, and the crisis reply", () => {
  const refusal = refusalOf(json({ written: false, why: "Posts can't include testimonials [name withheld].", offer_instead: "How to book" }))!;
  it("strips the guard's markers", () => {
    expect(refusal).toBe("Posts can't include testimonials. I can write one about how to book instead.");
  });
  it("uses the refusal sentence beside a change that worked, never 'didn't work'", () => {
    const attempts: Attempt[] = [
      { tool: "draft_instagram_post", failure: "x", writes: true, refusal },
      { tool: "remember", failure: null, writes: true },
    ];
    const out = honestReply("Saved your note.", attempts);
    expect(out).toBe(`Saved your note.\n\n${refusal}`);
    expect(out).not.toMatch(/didn't work/);
  });
  it("a refusal beside a real failure says both, plainly", () => {
    const out = honestReply("Done.", [
      { tool: "draft_instagram_post", failure: "x", writes: true, refusal },
      { tool: "update_facts", failure: "The fee must be a number.", writes: true },
    ]);
    expect(out).toBe(`Done.\n\nOne change didn't work: The fee must be a number.\n\n${refusal}`);
  });
  it("never prefixes the crisis reply", () => {
    expect(honestReply("Here you go.", [{ tool: "draft_instagram_post", failure: CRISIS_REPLY.slice(0, 217) + "...", writes: true }])).toBe(CRISIS_REPLY);
    expect(honestReply("Here you go.", [{ tool: "revise_instagram_post", failure: CRISIS_REPLY, writes: true, refusal: CRISIS_REPLY }])).toBe(CRISIS_REPLY);
  });
});

describe("10. with a post waiting, her words are an edit by default", () => {
  const waiting = { headline: "How booking works", caption: "Pick a time on my booking page. I see clients on Tuesdays and Thursdays." };
  it.each(["fewer words", "use Wednesday", "the fee is $175, not $150", "Wednesday instead", "booking on Thursdays only"])("'%s' is an edit", (t) => {
    expect(looksLikeNewTopic(t, waiting)).toBe(false);
  });
  it.each(["fewer words", "use Wednesday", "the fee is $175, not $150", "Wednesday instead"])("'%s' carries an edit signal", (t) => {
    expect(looksLikeEditSignal(t)).toBe(true);
  });
  it("a new post only when she says so or names a clearly different topic", () => {
    expect(looksLikeNewTopic("a new post about parking", waiting)).toBe(true);
    expect(looksLikeNewTopic("another post on telehealth", waiting)).toBe(true);
    expect(looksLikeNewTopic("Drop-in hours on Fridays", waiting)).toBe(true);
    expect(looksLikeNewTopic("Drop-in hours on Fridays", null)).toBe(false);
    expect(looksLikeEditSignal("Drop-in hours on Fridays")).toBe(false);
    expect(looksLikeEditSignal("a new post about fewer forms")).toBe(false);
  });
});

describe("re-check before merge: the exact phrasings from the review", () => {
  // In network with Aetna, no free consult.
  it.each([
    ["We're out of network with everyone", "insurance_claim"],
    ["I'm out of network for Aetna", "insurance_claim"],
    ["We're not in network with anyone", "insurance_claim"],
    ["Private pay only, Aetna included", "insurance_claim"],
    ["You get a superbill each session", "superbill"],
    ["Superbills every session", "superbill"],
    ["Book a free initial consult", "consult"],
    ["free discovery call", "consult"],
    ["In network with Cigna", "insurer"],
  ])("blocks %s", (s, kind) => {
    expect(kinds(s)).toContain(kind);
  });
  it("blocks a 30-minute discovery call when the consult is 15 minutes", () => {
    const fifteen = truthOf({ ...FACTS, answers: { ...FACTS.answers, freeConsultMinutes: 15 } });
    expect(factProblems("a 30-minute discovery call", fifteen).length).toBeGreaterThan(0);
  });
  it("never turns Cigna (not started) into 'Applying to…'", () => {
    expect(fixInNetwork("In network with Cigna", T)).not.toMatch(/applying/i);
  });
  it.each(["Feel free to call", "a superbill is available on request", "out of network for plans other than Aetna"])("passes %s", (s) => {
    expect(kinds(s)).toEqual([]);
  });
});
