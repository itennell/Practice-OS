// The post picture without any model: layout, words and the redraw loop.
// Set INSTAGRAM_PREVIEW_DIR to keep the sample JPEG for a look.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ChatFn } from "../lib/instagram/critic";
import { backgroundPrompt, composePost, designPost, LAYOUT_BRIEF, wordsSvg } from "../lib/instagram/graphic";
import { checkInstagramJpeg } from "../lib/instagram/image";
import { PILLAR_BY_ID } from "../lib/instagram/pillars";

const words = {
  headline: "What a session costs, and how superbills work",
  practiceName: "Reyes Counseling PLLC",
  licenseLine: "Dana Reyes, LCPC (fictional demo practice)",
};
const flat = () => sharp({ create: { width: 1024, height: 1024, channels: 3, background: "#EDE7F6" } }).png().toBuffer();
const headshot = readFileSync("public/demo/dana-reyes-headshot.jpg");
const says = (ok: boolean, problems: string[] = []): ChatFn =>
  (async () => ({ choices: [{ message: { content: JSON.stringify({ ok, problems }) } }] })) as unknown as ChatFn;

describe("post picture", () => {
  it("lays the words and the portrait onto an Instagram-ready JPEG", async () => {
    const jpeg = await composePost({ background: await flat(), cutout: headshot, words });
    expect(await checkInstagramJpeg(jpeg)).toEqual([]);
    if (process.env.INSTAGRAM_PREVIEW_DIR) writeFileSync(path.join(process.env.INSTAGRAM_PREVIEW_DIR, "post-preview.jpg"), jpeg);
  });

  it("draws words as outlines, so no font has to be installed", async () => {
    const { svg } = await wordsSvg(words);
    expect(svg.toString()).not.toContain("<text");
    expect(svg.toString()).toContain("<path");
  });

  it("shrinks a long headline, and refuses one that can't fit", async () => {
    await expect(wordsSvg({ ...words, headline: "Fees, superbills and what your insurance may pay back" })).resolves.toBeTruthy();
    await expect(wordsSvg({ ...words, headline: "word ".repeat(60) })).rejects.toThrow(/too long/);
  });

  it("tells Muse Image where the words go and forbids drawn text", () => {
    const p = backgroundPrompt(PILLAR_BY_ID.get("how_to_book")!);
    expect(p).toContain(LAYOUT_BRIEF);
    expect(p).toMatch(/no text, letters/i);
  });

  it("redraws once with the check's notes, then stops", async () => {
    const prompts: string[] = [];
    const g = await designPost(PILLAR_BY_ID.get("first_session")!, words, {
      cutout: async () => null,
      background: async (p) => (prompts.push(p), flat()),
      chat: says(false, ["Letters appear in the background"]),
    });
    expect(g.tries).toBe(2);
    expect(g.check.ok).toBe(false);
    expect(prompts[1]).toContain("Fix from the last try: Letters appear in the background");
  });

  it("stops after the first draw when the check passes", async () => {
    const g = await designPost(PILLAR_BY_ID.get("first_session")!, words, { cutout: async () => null, background: flat, chat: says(true) });
    expect(g).toMatchObject({ tries: 1, check: { ok: true } });
  });
});
