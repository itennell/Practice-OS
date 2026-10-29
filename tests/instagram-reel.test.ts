// The slide reel: words picked from the caption, her edits checked like a caption.
import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, db } from "../lib/db";
import { toInstagramJpeg } from "../lib/instagram/image";
import type { ChatFn } from "../lib/instagram/critic";
import { checkReel, draftReel, getReel, pointsFromCaption, saveReel, type Reel } from "../lib/instagram/reel";

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
  it.each(["How to work through anxiety", "Tips for coping with grief", "What helps with anxiety"])("refuses an advice slide: %s", (text) => {
    const problems = checkReel({ ...ok, slides: ok.slides.map((s, i) => (i === 1 ? { ...s, text } : s)) });
    expect(problems.join(" ")).toMatch(/^Slide 2: Posts stay on how your practice works/);
  });
  it("keeps her never-show list on the slide words", () => {
    const slides = ok.slides.map((s, i) => (i === 2 ? { ...s, text: "Here's a photo of me and my kids" } : s));
    expect(checkReel({ ...ok, slides }, { neverShow: ["face", "family"] }).join(" ")).toMatch(/Slide 3: It shows something you said posts never show/);
    expect(checkReel({ ...ok, slides })).toEqual([]);
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

describe.skipIf(!process.env.DATABASE_URL)("saveReel", () => {
  afterAll(async () => {
    await db()`delete from practice_os.posts where headline = 'Reel test post'`;
    await closeDb();
  });

  it("runs Muse's critic on words she changed, and only those", async () => {
    const jpeg = await toInstagramJpeg(readFileSync("public/demo/dana-reyes-headshot.jpg"));
    const [p] = await db()<{ id: string }[]>`
      insert into practice_os.posts (topic, caption, headline, image_jpeg, status, is_sample)
      values ('first_session', ${CAPTION}, 'Reel test post', ${jpeg}, 'ready', true) returning id`;
    const plain = (async () => ({ choices: [{ message: { content: JSON.stringify({ points: ["Sessions are 50 minutes.", "Paperwork comes first."], book: "Book from the link in bio." }) } }] })) as unknown as ChatFn;
    const first = await getReel(p.id, { chat: plain });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const calls: string[] = [];
    const critic = (verdict: string[]) =>
      (async (feature: string, params: { messages: { content: unknown }[] }) => {
        calls.push(`${feature}: ${String(params.messages.at(-1)?.content)}`);
        return { choices: [{ message: { content: JSON.stringify({ breaks: verdict }) } }] };
      }) as unknown as ChatFn;

    // Unchanged words: no Muse call.
    expect((await saveReel(p.id, first.reel, { chat: critic([]) })).ok).toBe(true);
    expect(calls).toEqual([]);

    // A changed slide Muse calls advice is refused, though plain code let it through.
    const edited = { ...first.reel, slides: first.reel.slides.map((s, i) => (i === 1 ? { ...s, text: "Most people feel calmer after a few weeks." } : s)) };
    const r = await saveReel(p.id, edited, { chat: critic(["advice"]) });
    expect(r).toMatchObject({ ok: false, status: 422 });
    expect(!r.ok && r.problems?.join(" ")).toMatch(/The safety check: Posts stay on logistics/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("Most people feel calmer");
    expect(calls[0]).not.toContain("Paperwork comes first.");
  });
});
