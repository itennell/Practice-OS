// Media copy tells the truth about the practice (lib/media/truth.ts): every price,
// insurer, superbill line and language matches her saved facts; the fee-label
// template, filler and "we" are repaired in plain code; a fact changed on one slide
// changes in the caption too; and a Psychology Today rewrite keeps her own answers.
// No model calls: Muse is a fixture.
import { describe, expect, it, vi } from "vitest";
vi.mock("../lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("../lib/aeon/guard", () => ({ guard: vi.fn(async (t: string) => ({ ok: true, text: t })), REFUSAL: {} }));

import { DANA } from "./media-fixtures";
import { codeCritic } from "../lib/instagram/critic";
import { captionOf, criticContext, repaired, stockPhrases, type PracticeFacts } from "../lib/instagram/write";
import { blocks, lintText } from "../lib/media/lint";
import { assemble, draftProfile, type ChatFn } from "../lib/media/profile";
import { TEXT_IDS } from "../lib/media/schema";
import { factProblems, feeText, fixFeeLabels, repairCopy, tidyOwnWords, truthOf } from "../lib/media/truth";
import { emptyDoc, type StudioDoc } from "../lib/studio/doc";
import { syncFacts } from "../lib/studio/facts-sync";
import { looksLikeEdit } from "../lib/instagram/revise";
import { studioRequest } from "../lib/aeon/tools-media";

// Dana on two panels, with an intake fee: the practice the Nov 2 stress test got wrong.
const FACTS = {
  ...DANA,
  fees: [
    { label: "First session (intake)", cents: 20000 },
    { label: "Therapy, 38-52 minutes", cents: 15000 },
  ],
  insurers: ["Aetna", "Blue Cross Blue Shield of Illinois"],
  inNetwork: ["Aetna", "Blue Cross Blue Shield of Illinois"],
};
const TRUTH = truthOf(FACTS);
const LICENSE = "Dana Reyes, LCPC (fictional demo practice)";
const POST: PracticeFacts = {
  clinicianName: "Dana Reyes",
  credential: "LCPC",
  practiceName: "Reyes Counseling PLLC",
  neighborhood: "Lincoln Park",
  city: "Chicago",
  licenseLine: LICENSE,
  fees: FACTS.fees,
  truth: TRUTH,
};
const ctx = criticContext(POST);
const rules = (text: string) => codeCritic(`${text}\n\n${LICENSE}`, ctx).findings.map((f) => f.rule);

describe("facts lint on posts", () => {
  it("rejects the stress-test carousel: private pay on two panels, an invented monthly superbill", () => {
    const text = "We are private pay. We do not bill insurance for you. Intake $200; 38-52 min $150. Each month we can give you a superbill.";
    const found = factProblems(text, TRUTH).map((p) => p.kind);
    expect(found).toEqual(expect.arrayContaining(["insurance_claim", "superbill"]));
    expect(rules(text)).toContain("wrong_fact");
  });

  it("rejects a price or insurer that isn't hers", () => {
    expect(rules("A session is $95.")).toContain("invented_fee");
    expect(rules("I'm in network with Cigna.")).toContain("wrong_fact");
    expect(rules("I take UnitedHealthcare.")).toContain("wrong_fact");
  });

  it("passes her real fees and plans, in any common spelling", () => {
    expect(rules("A first session is $200. I'm in network with Aetna and BCBS. For other plans, ask me for a superbill.")).toEqual([]);
  });

  it("an out-of-network practice may not claim it takes insurance", () => {
    const oon = truthOf({ ...FACTS, insurers: [], inNetwork: [] });
    expect(factProblems("I take insurance.", oon).map((p) => p.kind)).toContain("insurance_claim");
    expect(factProblems("I'm out of network. Ask me for a superbill.", oon)).toEqual([]);
  });

  it("never invents a language or a school", () => {
    const none = truthOf({ ...FACTS, answers: { ...FACTS.answers, languages: "" }, education: ["MA, Counseling, DePaul University, 2019"] });
    expect(factProblems("I speak English only.", none).map((p) => p.kind)).toEqual(["language"]);
    expect(factProblems("Sessions in Polish too.", none).map((p) => p.kind)).toEqual(["language"]);
    expect(factProblems("I trained at Northwestern University.", none).map((p) => p.kind)).toEqual(["education"]);
    expect(factProblems("I trained at DePaul University.", none)).toEqual([]);
  });
});

describe("plain-code repairs", () => {
  it("fixes the fee-label template", () => {
    expect(fixFeeLabels("It costs First session (intake): $200.", TRUTH)).toBe("A first session (intake) is $200.");
    expect(feeText(FACTS.fees[1])).toBe("$150 for a therapy session (38-52 minutes)");
  });

  it("says superbills come on request, drops filler and writes as I", () => {
    const out = repairCopy("Monthly superbills make it easy. No pressure, just reach out. We offer video sessions. Call us today.", TRUTH);
    expect(out).toBe("Superbills on request make it easy. I offer video sessions. Call me today.");
    expect(stockPhrases(out)).toEqual([]);
  });

  it("repairs a post before the critic reads it", () => {
    const fixed = repaired({ pillar: "fees_superbills", headline: "What it costs", body: "It costs First session (intake): $200. We look forward to meeting you. We accept Aetna.", altText: "" }, POST);
    expect(fixed.body).toBe("A first session (intake) is $200. I accept Aetna.");
    expect(codeCritic(captionOf(fixed.body, LICENSE), ctx).ok).toBe(true);
  });

  it("cleans her casual words without changing what she said", () => {
    expect(tidyOwnWords("i see people going thru breakups, CBT stuff & tech burnout")).toBe("I see people going through breakups, CBT and tech burnout");
  });
});

describe("studio: a fact changed on a slide changes in the caption too", () => {
  const doc: StudioDoc = {
    ...emptyDoc("carousel", "fees"),
    title: "What a session costs",
    caption: `A session is $150, and I see people on Tuesdays.\n\n${LICENSE}`,
    slides: [
      { id: "s1", kind: "point", text: "Sessions are $150", seconds: 3 },
      { id: "s2", kind: "point", text: "Open Tuesday evenings", seconds: 3 },
    ],
  };

  it("carries the new fee and day into the caption", () => {
    const edited = { ...doc, slides: [{ ...doc.slides[0], text: "Sessions are $175" }, { ...doc.slides[1], text: "Open Wednesday evenings" }] };
    const r = syncFacts(doc, edited);
    expect(r.doc.caption).toBe(`A session is $175, and I see people on Wednesdays.\n\n${LICENSE}`);
    expect(r.notes.join(" ")).toMatch(/\$150 to \$175 in the caption/);
  });

  it("carries a caption change onto the slides", () => {
    const r = syncFacts(doc, { ...doc, caption: doc.caption.replace("$150", "$200") });
    expect(r.doc.slides[0].text).toBe("Sessions are $200");
  });

  it("leaves murky edits alone", () => {
    const r = syncFacts(doc, { ...doc, slides: [{ ...doc.slides[0], text: "Sessions are $175 or $200" }, doc.slides[1]] });
    expect(r.doc.caption).toBe(doc.caption);
  });
});

// ---- Psychology Today rewrites -------------------------------------------------------------------

const HER = {
  ...DANA,
  education: ["MA, Clinical Mental Health Counseling, DePaul University, 2019"],
  answers: { ...DANA.answers, focus: "anxiety/burnout/tech/breakups", approach: "CBT stuff, talking it thru", languages: "" },
};

/** What the stress test got back for "make it warmer": seed text, a made-up language, demo notes. */
const WARMER: Record<string, string> = {
  statement_help: "Life can feel heavy. I offer a warm, welcoming space for adults and couples in Lincoln Park, Chicago. I'm Dana Reyes, LCPC.",
  statement_approach: "I keep things gentle and practical. I speak English only. I left the specialties list blank for this demo profile.",
  statement_about: "I'm Dana Reyes, LCPC. I went to Example University. This draft uses your demo practice info as a sample.",
  intro: "Free 15-minute call to see if we're a good fit.",
  note_finance: "My fee is $150 for a session. I'm in network with Blue Cross Blue Shield of Illinois.",
  note_credentials: "I'm a Licensed Clinical Professional Counselor (LCPC), licensed in Illinois.",
  note_top_specialties: "I see people going thru breakups and CBT stuff.",
  note_therapy_types: "I use talk therapy.",
};
const chatReturning = (body: Record<string, string>) => vi.fn(async () => ({ choices: [{ message: { content: JSON.stringify(body) } }] })) as unknown as ChatFn;

describe("PT rewrite keeps her answers", () => {
  const { fields } = assemble(HER, WARMER);
  const by = new Map(fields.map((f) => [f.id, f]));
  const all = fields.map((f) => f.text).join(" ").toLowerCase();

  it("keeps every topic she gave", () => {
    for (const w of ["anxiety", "burnout", "tech", "breakup", "cbt"]) expect(all).toContain(w);
  });

  it("never invents a language or school, and no paste box holds a note or her casual words", () => {
    expect(all).not.toMatch(/english only|example university|demo|sample|left the|thru|stuff/);
    // The boxes that named "Example University" and "English only" fell back to her own facts.
    expect(by.get("statement_about")!.from).toBe("template");
    expect(by.get("statement_approach")!.from).toBe("template");
  });

  it("moves Aeon's notes beside the box, never into it", () => {
    for (const f of fields) expect(blocks(lintText(f.text, HER, { limit: f.limit }))).toBe(false);
    const notes = fields.flatMap((f) => f.findings.filter((x) => x.rule === "placeholder").map((x) => x.message));
    expect(notes.every((n) => n.startsWith("Aeon's note, kept out of the box"))).toBe(true);
  });

  it("keeps Psychology Today's limits", () => {
    for (const f of fields) expect(f.text.length).toBeLessThanOrEqual(f.limit);
    expect(fields.map((f) => f.id)).toEqual(TEXT_IDS);
  });

  it("a tone rewrite reaches Muse with her answers and the facts", async () => {
    const chat = chatReturning(WARMER);
    await draftProfile(HER, { chat, tone: "warmer" });
    const prompt = JSON.stringify((chat as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1]);
    expect(prompt).toContain("warmer");
    expect(prompt).toContain("anxiety/burnout/tech/breakups");
    expect(prompt).toContain("DePaul University");
    expect(prompt).toMatch(/never mention languages/);
  });
});

describe("chat routing", () => {
  it("tells an edit from a new post", () => {
    for (const t of ["make it shorter", "change it to Wednesday", "Make the caption warmer", "add the fee"]) expect(looksLikeEdit(t)).toBe(true);
    for (const t of ["a post about how booking works", "make a reel about my fees", "add a post about parking"]) expect(looksLikeEdit(t)).toBe(false);
  });

  it("spells out the kind she asked for", () => {
    expect(studioRequest("how booking works", "reel")).toBe("Make a reel about how booking works");
    expect(studioRequest("make a carousel about fees", "carousel")).toBe("make a carousel about fees");
  });
});
