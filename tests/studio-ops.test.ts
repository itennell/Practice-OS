import { describe, expect, it } from "vitest";
import { parseColor, ratio } from "../lib/ui/contrast";
const contrastRatio = (a: string, b: string) => ratio(parseColor(a)!, parseColor(b)!);
import { emptyDoc, PALETTE, PALETTES, shapeProblems, videoSeconds, type StudioDoc } from "../lib/studio/doc";
import { applyOps, CANVAS_ONLY, OP_NAMES } from "../lib/studio/ops";
import { describeDoc, standInProposal } from "../lib/studio/edit";

function reel(): StudioDoc {
  return {
    ...emptyDoc("reel", "how booking works"),
    title: "How booking works",
    caption: "Booking takes two steps.\n\nDana Reyes, LCPC (fictional demo practice)",
    slides: [
      { id: "s1", kind: "picture", text: "", seconds: 3 },
      { id: "s2", kind: "point", text: "Pick a time that works for you on the booking page", seconds: 4 },
      { id: "s3", kind: "point", text: "We talk for 15 minutes first, free", seconds: 4 },
      { id: "s4", kind: "book", text: "Book a free call. Link in bio.", seconds: 4 },
    ],
  };
}

function video(): StudioDoc {
  return {
    ...emptyDoc("video", "a tour of the office"),
    clips: [
      { id: "c1", source: "opfs:a", name: "a.mp4", duration: 10, in: 0, out: 10 },
      { id: "c2", source: "opfs:b", name: "b.mp4", duration: 6, in: 1, out: 6 },
    ],
    overlays: [{ id: "o1", text: "Welcome", start: 4, end: 6, position: "bottom" }],
  };
}

const ok = (r: ReturnType<typeof applyOps>) => {
  if (!r.ok) throw new Error(r.why);
  return r.doc;
};

describe("studio ops", () => {
  it("never changes the document it was given", () => {
    const d = reel();
    const before = structuredClone(d);
    ok(applyOps(d, [{ op: "move_slide", slide: 2, to: 3 }]));
    expect(d).toEqual(before);
  });

  it("shortens a slide only when the words get shorter", () => {
    const d = ok(applyOps(reel(), [{ op: "shorten_slide", slide: 2, text: "Pick a time online" }]));
    expect(d.slides[1].text).toBe("Pick a time online");
    const longer = applyOps(reel(), [{ op: "shorten_slide", slide: 3, text: "We talk for 15 minutes first, free, on the phone or video" }]);
    expect(longer.ok).toBe(false);
  });

  it("keeps how to book last and the picture once in a reel", () => {
    expect(applyOps(reel(), [{ op: "move_slide", slide: 4, to: 1 }])).toMatchObject({ ok: false, why: "How to book stays the last slide." });
    expect(applyOps(reel(), [{ op: "remove_slide", slide: 1 }]).ok).toBe(false);
    const added = ok(applyOps(reel(), [{ op: "add_slide", after: 10, text: "Sessions by video too" }]));
    expect(added.slides.at(-1)?.kind).toBe("book");
    expect(added.slides.at(-2)?.text).toBe("Sessions by video too");
  });

  it("is all or nothing", () => {
    const r = applyOps(reel(), [{ op: "set_palette", palette: "warm" }, { op: "set_slide_text", slide: 9, text: "x" }]);
    expect(r).toMatchObject({ ok: false });
  });

  it("refuses ops it doesn't know and canvas-only ops from chat", () => {
    expect(applyOps(reel(), [{ op: "publish" }]).ok).toBe(false);
    expect(applyOps(reel(), [{ op: "set_slide_text", slide: 2, text: "x".repeat(200) }]).ok).toBe(false);
    const clip = { id: "c1", source: "opfs:x", name: "x.mp4", duration: 4, in: 0, out: 4 };
    expect(applyOps(emptyDoc("video"), [{ op: "add_clip", clip }], { from: "chat" }).ok).toBe(false);
    expect(ok(applyOps(emptyDoc("video"), [{ op: "add_clip", clip }], { from: "canvas" })).clips).toHaveLength(1);
    expect(CANVAS_ONLY.has("set_cues")).toBe(true);
  });

  it("new picture is an effect for the server, and a version in the document", () => {
    const r = applyOps(reel(), [{ op: "new_picture", idea: "a window with plants" }]);
    expect(r.ok && r.effects).toEqual([{ kind: "picture", idea: "a window with plants" }]);
    expect(r.ok && r.doc.picture).toBe(1);
  });

  it("cuts, trims and splits video and keeps texts on their moment", () => {
    const d = ok(applyOps(video(), [{ op: "cut_start", seconds: 3 }]));
    expect(d.clips[0]).toMatchObject({ in: 3, out: 10 });
    expect(d.overlays[0]).toMatchObject({ start: 1, end: 3 });
    expect(videoSeconds(d)).toBe(12);
    const s = ok(applyOps(video(), [{ op: "split_clip", clip: 2, at: 2 }]));
    expect(s.clips.map((c) => [c.in, c.out])).toEqual([[0, 10], [1, 3], [3, 6]]);
    expect(new Set(s.clips.map((c) => c.id)).size).toBe(3);
    expect(applyOps(video(), [{ op: "trim_clip", clip: 1, in: 9, out: 2 }]).ok).toBe(false);
    expect(ok(applyOps(video(), [{ op: "trim_clip", clip: 1, out: 99 }])).clips[0].out).toBe(10);
    const moved = ok(applyOps(video(), [{ op: "move_clip", clip: "c2", to: 1 }]));
    expect(moved.clips.map((c) => c.id)).toEqual(["c2", "c1"]);
  });

  // Review (PR #103): a cut at the start moves captions and the cover frame too, and says what it took out.
  it("cut_start moves captions and the cover frame, and reports texts in the cut part", () => {
    const d = {
      ...video(),
      overlays: [
        { id: "o1", text: "Welcome", start: 4, end: 6, position: "bottom" as const },
        { id: "o2", text: "Hi there", start: 0, end: 2, position: "top" as const },
      ],
      captions: { on: true, cues: [{ start: 0, end: 2, text: "hello" }, { start: 5, end: 7, text: "this is the office" }] },
      cover: { time: 6 },
    };
    const r = applyOps(d, [{ op: "cut_start", seconds: 3 }]);
    if (!r.ok) throw new Error(r.why);
    expect(r.doc.overlays.map((o) => o.id)).toEqual(["o1"]);
    expect(r.doc.captions.cues).toEqual([{ start: 2, end: 4, text: "this is the office" }]);
    expect(r.doc.cover).toEqual({ time: 3 });
    expect(r.notes).toEqual(['took out the text "Hi there" that was in the cut part', "took out 1 caption in the cut part"]);
    const plain = applyOps(video(), [{ op: "set_palette", palette: "warm" }]);
    expect(plain.ok && plain.notes).toEqual([]);
  });

  it("adds text at the start, captions on, a cover frame", () => {
    const d = ok(applyOps(video(), [{ op: "add_text", text: "How booking works", start: 0, end: 3 }, { op: "set_captions", on: true }, { op: "set_cover", time: 2 }]));
    expect(d.overlays.at(-1)).toMatchObject({ text: "How booking works", start: 0, end: 3, position: "bottom" });
    expect(d.captions.on).toBe(true);
    expect(d.cover).toEqual({ time: 2 });
  });

  it("says plainly what's wrong", () => {
    expect(applyOps(reel(), [{ op: "set_slide_text", slide: 7, text: "x" }])).toEqual({ ok: false, why: "There's no slide 7; there are 4." });
    expect(applyOps(emptyDoc("video"), [{ op: "cut_start", seconds: 3 }])).toEqual({ ok: false, why: "There's no video yet. Add one first." });
  });

  it("every op has a description and a doc shape check", () => {
    expect(OP_NAMES.length).toBeGreaterThan(20);
    expect(shapeProblems(reel())).toEqual([]);
    expect(describeDoc(reel())).toContain('2. [point, 4 s] "Pick a time');
  });

  it("palettes pass WCAG AA for words and the accent", () => {
    for (const id of PALETTES) {
      const p = PALETTE[id];
      expect(contrastRatio(p.ink, p.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.muted, p.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(p.accent, p.paper)).toBeGreaterThanOrEqual(3);
    }
  });

  it("the test stand-in maps the Playwright phrases", () => {
    const p = standInProposal("make slide 2 shorter", reel());
    const d = ok(applyOps(reel(), p.ops));
    expect(d.slides[1].text.length).toBeLessThan(reel().slides[1].text.length);
  });
});

describe("chat: new or change", async () => {
  const { isNewRequest } = await import("../components/studio/studio");
  it("tells a new request from an edit", () => {
    for (const t of ["make a reel about how booking works", "Make a carousel about what a first session is like", "can you make me a new post about fees", "Edit my own video", "make another reel on superbills"]) expect(isNewRequest(t), t).toBe(true);
    for (const t of ["make slide 2 shorter", "make it warmer", "make the post square", "swap the picture", "cut the first 3 seconds", "make the reel 12 seconds"]) expect(isNewRequest(t), t).toBe(false);
  });
});
