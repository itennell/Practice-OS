// The studio's safety check on its own, no database: her real fees on slides and
// texts, the joined slide run (two safe slides that read as advice together), and
// what a new picture is asked to show.
import { describe, expect, it } from "vitest";
import { RULE_TEXT, type ChatFn } from "../lib/instagram/critic";
import { checkStep, joinedText, pictureIdeaProblems, textProblems, type Limits } from "../lib/studio/check";
import { emptyDoc, type StudioDoc } from "../lib/studio/doc";

const LICENSE = "Dana Reyes, LCPC (fictional demo practice)";
const limits: Limits = { ctx: { licenseLine: LICENSE, feesCents: [15000] }, neverShow: ["family"] };

function reel(points: string[] = ["Pick a time online", "We talk for 15 minutes first, free"]): StudioDoc {
  return {
    ...emptyDoc("reel", "how booking works"),
    title: "How booking works",
    caption: `Booking takes two steps.\n\n${LICENSE}`,
    slides: [
      { id: "s1", kind: "picture", text: "", seconds: 3 },
      ...points.map((text, i) => ({ id: `s${i + 2}`, kind: "point" as const, text, seconds: 4 })),
      { id: "s9", kind: "book", text: "Book a free call. Link in bio.", seconds: 4 },
    ],
  };
}

/** A Muse critic stub that records what it read and finds `breaks`. */
function critic(breaks: string[] = []) {
  const read: string[] = [];
  const chat = (async (_feature: string, params: { messages: { content: unknown }[] }) => {
    read.push(String(params.messages.at(-1)?.content));
    return { choices: [{ message: { content: JSON.stringify({ breaks }) } }] };
  }) as unknown as ChatFn;
  return { chat, read };
}

describe("studio check", () => {
  it("a price on a slide must be one of her real fees", () => {
    expect(textProblems("Sessions are $150", limits)).toEqual([]);
    expect(textProblems("Sessions are $99", limits)).toContain(RULE_TEXT.invented_fee);
    // The license line belongs to the caption, never a slide.
    expect(textProblems("Book a free call", limits)).toEqual([]);
  });

  it("an invented fee on a slide, a text or a caption cue is refused", async () => {
    const { chat } = critic();
    const before = reel();
    const slide = await checkStep(before, reel(["Pick a time online", "Sessions are $99"]), limits, { chat });
    expect(slide).toMatchObject({ ok: false, why: RULE_TEXT.invented_fee });
    const overlay = await checkStep(before, { ...before, overlays: [{ id: "o1", text: "Only $20 a visit", start: 0, end: 2, position: "bottom" }] }, limits, { chat });
    expect(overlay).toMatchObject({ ok: false, why: RULE_TEXT.invented_fee });
    const cue = await checkStep(before, { ...before, captions: { on: true, cues: [{ start: 0, end: 2, text: "it costs $45" }] } }, limits, { chat });
    expect(cue).toMatchObject({ ok: false, why: RULE_TEXT.invented_fee });
    expect(await checkStep(before, reel(["Pick a time online", "Sessions are $150"]), limits, { chat })).toEqual({ ok: true });
  });

  it("two slides that read as advice together are refused, even when each one alone is fine", async () => {
    const { chat } = critic();
    expect(textProblems("Signs that", limits)).toEqual([]);
    expect(textProblems("you are depressed", limits)).toEqual([]);
    const r = await checkStep(reel(), reel(["Signs that", "you are depressed"]), limits, { chat });
    expect(r.ok).toBe(false);
  });

  it("moving a slide re-checks the whole joined run with Muse, not only new words", async () => {
    const before = reel(["We talk for 15 minutes first, free", "Pick a time online"]);
    const moved = reel(["Pick a time online", "We talk for 15 minutes first, free"]);
    const { chat, read } = critic();
    expect(await checkStep(before, moved, limits, { chat })).toEqual({ ok: true });
    expect(read).toHaveLength(1);
    expect(read[0]).toContain(joinedText(moved));
    // Muse finding advice in the joined run stops the step.
    const advice = critic(["advice"]);
    expect(await checkStep(before, moved, limits, { chat: advice.chat })).toMatchObject({ ok: false, hardStop: false });
    // A colour change touches no words: nothing to re-read.
    const quiet = critic();
    expect(await checkStep(moved, { ...moved, palette: "warm" }, limits, { chat: quiet.chat })).toEqual({ ok: true });
    expect(quiet.read).toHaveLength(0);
  });

  it("a new picture's idea gets the plain-code rules, the topic gate and her whole never-show list", () => {
    expect(pictureIdeaProblems("a sunny office with a plant", limits)).toEqual({ hardStop: false, problems: [] });
    expect(pictureIdeaProblems("ways to manage your anxiety", limits).problems.length).toBeGreaterThan(0);
    expect(pictureIdeaProblems("me with my kids at the park", limits).problems).toContain(RULE_TEXT.never_show);
    expect(pictureIdeaProblems("someone thinking about suicide", limits)).toMatchObject({ hardStop: true });
  });
});
