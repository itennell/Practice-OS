// Item 8 of the PR #123 review: the "Facts changed" flag shows on every kind the studio
// makes, reels included. Only a video from her own footage goes without Regenerate.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FACTS_CHANGED, FactsChanged, studioFlag } from "../components/studio/facts-changed";
import { emptyDoc } from "../lib/studio/doc";
import { docTexts, factsChanged } from "../lib/studio/stale";
import { truthOf } from "../lib/media/truth";
import { DANA } from "./media-fixtures";

const PROBLEM = ["It says you don't take insurance, but you're in network with Aetna."];

describe("the studio's Facts changed flag", () => {
  it.each(["post", "carousel", "reel"])("shows on a %s, with Regenerate", (kind) => {
    expect(studioFlag(kind, PROBLEM)).toEqual({ show: true, regenerate: true });
  });
  it("shows on her own video, without Regenerate", () => {
    expect(studioFlag("video", PROBLEM)).toEqual({ show: true, regenerate: false });
  });
  it("stays hidden when nothing is wrong", () => {
    for (const kind of ["post", "reel", "video"]) expect(studioFlag(kind, [])).toEqual({ show: false, regenerate: false });
    expect(studioFlag("reel", undefined).show).toBe(false);
  });

  it("renders on a reel with its Regenerate button, and on a video without", () => {
    const reel = renderToStaticMarkup(createElement(FactsChanged, { problems: PROBLEM, onRegenerate: () => {} }));
    expect(reel).toContain(FACTS_CHANGED);
    expect(reel).toContain("Regenerate");
    const video = renderToStaticMarkup(createElement(FactsChanged, { problems: PROBLEM }));
    expect(video).toContain(FACTS_CHANGED);
    expect(video).not.toContain("Regenerate");
  });

  it("a reel's slide words are checked against her facts", () => {
    const truth = truthOf({ ...DANA, insurers: ["Aetna"], inNetwork: ["Aetna"] });
    const doc = emptyDoc("reel", "fees");
    doc.slides = [{ ...(doc.slides[0] ?? {}), kind: "text", text: "Private pay only, no insurance." } as never];
    const problems = factsChanged(docTexts(doc), truth);
    expect(problems.length).toBeGreaterThan(0);
    expect(studioFlag(doc.kind, problems)).toEqual({ show: true, regenerate: true });
  });
});
