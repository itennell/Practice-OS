// The slide reel: words picked from the caption, her edits checked like a caption.
import { describe, expect, it } from "vitest";
import type { ChatFn } from "../lib/instagram/critic";
import { checkReel, draftReel, pointsFromCaption, type Reel } from "../lib/instagram/reel";

const LICENSE = "Dana Reyes, LCPC (fictional demo practice)";
const CAPTION = `Wondering what your first session is like? It's 50 minutes. We go over paperwork and what brings you in. Book a free 15-minute call from the link in bio. #therapy\n\n${LICENSE}`;
const ok: Reel = {
  seconds: 15,
  slides: [
    { kind: "picture", text: "" },
    { kind: "point", text: "Your first session is 50 minutes." },
    { kind: "point", text: "We go over paperwork together." },
    { kind: "book", text: "Book a free 15-minute call. Link in bio." },
  ],
};

describe("checkReel", () => {
  it("passes a plain logistics reel", () => {
    expect(checkReel(ok)).toEqual([]);
  });
  it("keeps the length between 10 and 20 seconds and 3 to 5 slides", () => {
    expect(checkReel({ ...ok, seconds: 25 })).toContain("The reel is 10 to 20 seconds long.");
    expect(checkReel({ ...ok, slides: ok.slides.slice(0, 2) }).join(" ")).toMatch(/3 to 5 slides/);
  });
  it("refuses advice she typed into a slide, and self-harm", () => {
    const advice = checkReel({ ...ok, slides: ok.slides.map((s, i) => (i === 1 ? { ...s, text: "Try box breathing tonight" } : s)) });
    expect(advice.join(" ")).toMatch(/^Slide 2: Posts stay on logistics/);
    const harm = checkReel({ ...ok, slides: ok.slides.map((s, i) => (i === 2 ? { ...s, text: "If you think about suicide" } : s)) });
    expect(harm.join(" ")).toMatch(/988/);
  });
  it("needs the picture and how to book exactly once", () => {
    expect(checkReel({ ...ok, slides: [ok.slides[1], ok.slides[2], ok.slides[3]] })).toContain("A reel has your post picture once.");
  });
});

describe("draftReel", () => {
  it("without a model, takes points and the booking line from the caption", () => {
    const p = pointsFromCaption(CAPTION, LICENSE);
    expect(p.book).toBe("Book a free 15-minute call from the link in bio.");
    expect(p.points).toContain("It's 50 minutes.");
    expect(p.points.join(" ")).not.toMatch(/#therapy|LCPC/);
  });

  it("uses Muse's points but drops one that gives advice", async () => {
    const chat = (async () => ({
      choices: [{ message: { content: JSON.stringify({ points: ["Sessions are 50 minutes.", "Try box breathing before you come.", "Paperwork takes 10 minutes."], book: "Book from the link in bio." }) } }],
    })) as unknown as ChatFn;
    const r = await draftReel(CAPTION, LICENSE, { chat });
    expect(r.slides.map((s) => s.kind)).toEqual(["picture", "point", "point", "book"]);
    expect(r.slides.map((s) => s.text)).toEqual(["", "Sessions are 50 minutes.", "Paperwork takes 10 minutes.", "Book from the link in bio."]);
    expect(r.seconds).toBe(15);
    expect(checkReel(r)).toEqual([]);
  });
});
