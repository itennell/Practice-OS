// The Nov 2 re-test on merged main (claude/media-grow-polish): a fees-and-superbills
// carousel blocked by true sentences, a memory saying BCBS approved while the payer list
// says applied, private_pay_plan read as a failure, post ideas saying "private pay",
// "Drop-in hours on Fridays" sent to the edit tool, and refusals leaking JSON.
// Fixtures only, no model calls.
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/aeon/guard", () => ({ guard: vi.fn(async (t: string) => ({ ok: true, text: t })), REFUSAL: {} }));

import { DANA } from "./media-fixtures";
import { codeCritic, RULE_TEXT } from "../lib/instagram/critic";
import { checkIdeas } from "../lib/instagram/coach";
import { looksLikeEdit, looksLikeNewTopic } from "../lib/instagram/revise";
import { factProblems, factSheet, fixInNetwork, repairCopy, truthOf } from "../lib/media/truth";
import { planInWords, privatePayPlan, SAMPLE_INPUT } from "../lib/growth/plan";
import { honestReply, memoryBlock, outcomeOf, refusalOf, writesData } from "../lib/aeon/agent";

// The seeded demo practice: Aetna approved, BCBSIL applied (db/seed/demo.sql), three fees.
const FACTS = {
  ...DANA,
  fees: [
    { label: "First session (intake)", cents: 20000 },
    { label: "Therapy, 38-52 minutes", cents: 15000 },
    { label: "Therapy, 53 minutes or longer", cents: 17500 },
  ],
  insurers: ["BCBSIL", "Aetna"],
  inNetwork: ["Aetna"],
  answers: { ...DANA.answers, freeConsultMinutes: 0 as const, consultAsked: true },
};
const TRUTH = truthOf(FACTS);
const kinds = (t: string) => factProblems(t, TRUTH).map((p) => p.kind);
const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v) }] });

describe("#1 a fees and superbills carousel passes when it is true", () => {
  it("true sentences about how a superbill works are not flagged", () => {
    for (const s of [
      "A superbill lists the date, code and fee for each session.",
      "A superbill shows each session you paid for, so your insurer can pay you back.",
      "For plans other than Aetna, I'm out of network. Ask me for a superbill.",
      "Feel free to call with questions about fees.",
      "A 53-minute session is $175. Call to book.",
      "A first session is $200. Sessions are $150 (38-52 min) or $175 (53 minutes or longer).",
      "In network with Aetna. I'm applying to BCBSIL.",
    ]) expect(kinds(s), s).toEqual([]);
  });

  it("still blocks what is wrong, naming the fact", () => {
    expect(kinds("You get a superbill after each session.")).toContain("superbill");
    expect(kinds("Superbills are sent each month.")).toContain("superbill");
    expect(kinds("I give insurance paperwork each month.")).toContain("superbill");
    expect(kinds("I'm private pay. I don't take insurance.")).toContain("insurance_claim");
    expect(kinds("Book a free 15-minute call.")).toContain("consult");
    const fee = codeCritic("Sessions are $95.", { licenseLine: "", feesCents: [20000, 15000, 17500], truth: TRUTH }).findings.find((f) => f.rule === "invented_fee");
    expect(fee?.message).toBe(`${RULE_TEXT.invented_fee} It states the fee $95, which isn't on your fee list.`);
  });

  it("a memory said BCBS approved; the payer list wins and the copy is repaired, not blocked", () => {
    expect(kinds("I'm in network with Aetna and BCBSIL.")).toContain("insurance_claim");
    expect(fixInNetwork("I'm in network with Aetna and BCBSIL.", TRUTH)).toBe("I'm in network with Aetna.");
    expect(fixInNetwork("In network with BCBSIL.", TRUTH)).toBe("Applying to be in network with BCBSIL.");
    expect(fixInNetwork("I'm in network with BCBSIL.", TRUTH)).toBe("I'm applying to be in network with BCBSIL.");
    // A plan she isn't with at all is left for the check to name.
    expect(fixInNetwork("In network with Cigna.", TRUTH)).toBe("In network with Cigna.");
    const fixed = repairCopy("I'm in network with Aetna and BCBSIL. A superbill lists each session.", TRUTH);
    expect(factProblems(fixed, TRUTH)).toEqual([]);
  });

  it("the writer and the chat are told saved facts win over notes", () => {
    expect(factSheet(TRUTH).join("\n")).toMatch(/saved facts win over anything else/);
    expect(memoryBlock([{ id: "m1", kind: "fact", text: "BCBS approved Nov 1" }])).toMatch(/saved settings win over a note/);
  });
});

describe("#2 private_pay_plan: needs-your-numbers is not a failure", () => {
  it("a plan result is ok, in plain words, with the next question", () => {
    const plan = privatePayPlan({ ...SAMPLE_INPUT, panels: [{ payer: "BCBSIL", weekly_sessions: 10, rate_cents: null, kind: "commercial" }] }, FACTS.fees.map((f) => ({ ...f, code: "" })));
    expect(plan.asks.join(" ")).toMatch(/What does BCBSIL pay you/);
    const words = planInWords(plan);
    expect(words).toMatch(/^\[Sample\] /);
    expect(words).toMatch(/What does BCBSIL pay you/);
    // The tool's answer, as the chat sees it, never reads as a failed save.
    expect(outcomeOf(json({ headline: plan.headline, in_plain_words: words, needs_your_numbers: true, ask_her_next: plan.asks[0] }))).toEqual({ state: "ok" });
  });

  it("her rate and sessions are used", () => {
    const plan = privatePayPlan({ panels: [{ payer: "BCBSIL", weekly_sessions: 10, rate_cents: 9500, kind: "commercial" }], target_weekly_sessions: null, target_monthly_income_cents: null }, [{ label: "Therapy", cents: 15000, code: "90834" }]);
    expect(plan.panels[0]).toMatchObject({ rateCents: 9500, weeklySessions: 10, clientsToReplace: 7 });
    expect(planInWords(plan)).toMatch(/BCBSIL pays \$95 a session for 10 sessions a week/);
    expect(planInWords(plan)).not.toMatch(/\[Sample\]/);
  });

  it("a lookup-only call (save not asked) is not counted as a write", () => {
    expect(writesData("private_pay_plan", {})).toBe(false);
    expect(writesData("private_pay_plan", { save: true })).toBe(true);
    expect(writesData("draft_instagram_post", { request: "x" })).toBe(true);
  });

  it("a failure never shows raw JSON", () => {
    const o = outcomeOf(json({ saved: false, headline: "x", panels: [{ payer: "BCBSIL" }] }));
    expect(o).toEqual({ state: "failed", why: "It didn't go through." });
  });
});

describe("#3 post ideas get the same fact check", () => {
  const raw = (points: string[]) => [{ topic: "fees_superbills", hook: "How paying works", points, call_to_action: "Book on my site.", picture: "A calm desk." }];
  const opts = { topics: ["fees_superbills" as const], neverShow: [], feesCents: FACTS.fees.map((f) => f.cents), truth: TRUTH };

  it("drops 'We are private pay. We do not bill insurance' when a plan approved her", () => {
    expect(checkIdeas(raw(["We are private pay.", "We do not bill insurance."]), opts).kept).toEqual([]);
  });

  it("repairs a monthly paperwork line and 'we' instead of offering it", () => {
    const c = checkIdeas(raw(["We give paperwork each month.", "In network with Aetna."]), opts);
    expect(c.kept[0].points).toEqual(["I can give you a superbill on request.", "In network with Aetna."]);
  });
});

describe("#7 a new topic is a new post", () => {
  it("'Drop-in hours on Fridays' is a new topic; explicit edits stay edits", () => {
    const waiting = { headline: "How booking works", caption: "Pick a time on my booking page. I see clients on Tuesdays." };
    expect(looksLikeNewTopic("Drop-in hours on Fridays", waiting)).toBe(true);
    expect(looksLikeNewTopic("Parking near the office", waiting)).toBe(true);
    for (const t of ["make it shorter", "change slide 2", "shorter", "warmer please", "what about Fridays?"]) expect(looksLikeNewTopic(t), t).toBe(false);
    expect(looksLikeEdit("make it shorter")).toBe(true);
  });
});

describe("#8 refusals are plain sentences", () => {
  const why = "Posts can't include or ask for testimonials or reviews, so Aeon can't write that one.";
  const result = json({ written: false, why, offer_instead: "How to book" });

  it("the refusal is the tool's sentence and its offer, never JSON", () => {
    expect(refusalOf(result)).toBe(`${why} I can write one about how to book instead.`);
    const attempt = { tool: "draft_instagram_post", failure: outcomeOf(result).state === "failed" ? why : null, writes: true, refusal: refusalOf(result)! };
    const leaked = `That didn't work: {"written": false, "why": "${why}", "offer_instead": "[name withheld]"}`;
    expect(honestReply(leaked, [attempt])).toBe(`${why} I can write one about how to book instead.`);
    expect(honestReply("Sure, here you go.", [attempt])).toBe(`${why} I can write one about how to book instead.`);
    // Her own plain answer that already says no stands.
    expect(honestReply("I can't write testimonials, but I can write about booking.", [attempt])).toBe("I can't write testimonials, but I can write about booking.");
  });

  it("a real failure is not a refusal", () => {
    expect(refusalOf(json({ written: false, why: "Aeon couldn't write that post." }))).toBeNull();
  });
});
