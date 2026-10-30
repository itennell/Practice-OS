import { describe, expect, it } from "vitest";
import { encodeWav } from "../components/shared/dictation-audio";
import { emptyDoc, type StudioDoc } from "../lib/studio/doc";
import { applyOps } from "../lib/studio/ops";
import { activeCue, activeOverlays, chunkRanges, clock, coverCrop, cueFor, frameTimes, isSilent, locate, mixToMono, OUTPUT, segments, timelineTime, totalSeconds } from "../lib/studio/timeline";

function video(): StudioDoc {
  return {
    ...emptyDoc("video", "a tour of the office"),
    clips: [
      { id: "c1", source: "a.mp4", name: "a.mp4", duration: 10, in: 2, out: 6 },
      { id: "c2", source: "b.mp4", name: "b.mp4", duration: 6, in: 1, out: 4 },
    ],
    overlays: [{ id: "o1", text: "Welcome", start: 1, end: 3, position: "bottom" }],
  };
}

describe("timeline maths", () => {
  it("lays the kept parts end to end", () => {
    const s = segments(video().clips);
    expect(s.map((x) => [x.start, x.end])).toEqual([
      [0, 4],
      [4, 7],
    ]);
    expect(totalSeconds(video().clips)).toBe(7);
  });

  it("finds which clip and file time plays at t", () => {
    const { clips } = video();
    expect(locate(clips, 0)).toMatchObject({ seg: { index: 0 }, sourceTime: 2 });
    expect(locate(clips, 3.5)).toMatchObject({ seg: { index: 0 }, sourceTime: 5.5 });
    expect(locate(clips, 4)).toMatchObject({ seg: { index: 1 }, sourceTime: 1 });
    expect(locate(clips, 6.5)).toMatchObject({ seg: { index: 1 }, sourceTime: 3.5 });
    // Past the end: the last frame.
    expect(locate(clips, 99)).toMatchObject({ seg: { index: 1 }, sourceTime: 4 });
    expect(locate([], 1)).toBeNull();
    expect(timelineTime(clips, 1, 2)).toBe(5);
  });

  it("follows the edits: after cut_start and move_clip the same moment maps to the new place", () => {
    const r = applyOps(video(), [{ op: "cut_start", seconds: 1 }, { op: "move_clip", clip: "c2", to: 1 }]);
    if (!r.ok) throw new Error(r.why);
    expect(locate(r.doc.clips, 0)).toMatchObject({ seg: { clip: { id: "c2" } }, sourceTime: 1 });
    expect(locate(r.doc.clips, 3)).toMatchObject({ seg: { clip: { id: "c1" } }, sourceTime: 3 });
    expect(totalSeconds(r.doc.clips)).toBe(6);
    // The text stays on its footage: "Welcome" is on c1's file seconds 3-5,
    // which play at 0-2 after the cut and at 3-5 once c1 moves second.
    expect(r.doc.overlays[0]).toMatchObject({ start: 3, end: 5 });
  });

  it("shows text and captions only inside their times", () => {
    const d = video();
    expect(activeOverlays(d.overlays, 0.5)).toEqual([]);
    expect(activeOverlays(d.overlays, 1)).toHaveLength(1);
    expect(activeOverlays(d.overlays, 3)).toEqual([]);
    const cues = [{ start: 0, end: 4, text: "Hello" }, { start: 4, end: 7, text: "Book a call" }];
    expect(activeCue(cues, 4)?.text).toBe("Book a call");
    expect(activeCue(cues, 7)).toBeNull();
  });

  it("crops the centre to the post's shape", () => {
    // A landscape 1920x1080 frame into 9:16 keeps the middle 607.5 px.
    const c = coverCrop(1920, 1080, OUTPUT["9:16"].width, OUTPUT["9:16"].height);
    expect(c.sh).toBe(1080);
    expect(c.sw).toBeCloseTo(607.5);
    expect(c.sx).toBeCloseTo((1920 - 607.5) / 2);
    // A tall phone frame into 1:1 keeps the middle square.
    expect(coverCrop(720, 1280, 1080, 1080)).toEqual({ sx: 0, sy: 280, sw: 720, sh: 720 });
  });

  it("counts frames at 30 fps", () => {
    expect(frameTimes(3, 30)).toHaveLength(90);
    expect(frameTimes(3, 30)[30]).toBe(1);
  });
});

describe("captions pieces", () => {
  it("cuts the finished video's sound into ~4 s pieces and places each cue there", () => {
    expect(chunkRanges(10)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 8 },
      { start: 8, end: 10 },
    ]);
    expect(chunkRanges(8)).toHaveLength(2);
    expect(chunkRanges(0)).toEqual([]);
    expect(cueFor({ start: 4, end: 8 }, "  Book  a free\ncall ")).toEqual({ start: 4, end: 8, text: "Book a free call" });
    expect(cueFor({ start: 4, end: 8 }, "   ")).toBeNull();
  });

  it("skips quiet pieces and mixes channels to one", () => {
    expect(isSilent(new Float32Array(2400))).toBe(true);
    const tone = Float32Array.from({ length: 2400 }, (_, i) => 0.3 * Math.sin(i / 5));
    expect(isSilent(tone)).toBe(false);
    expect(Array.from(mixToMono([Float32Array.from([1, 0]), Float32Array.from([0, 0])]))).toEqual([0.5, 0]);
  });

  it("writes a mono 16-bit 24 kHz WAV", () => {
    const wav = new DataView(encodeWav(Float32Array.from([0, 1, -1]), 24_000));
    const ascii = (at: number) => String.fromCharCode(...[0, 1, 2, 3].map((i) => wav.getUint8(at + i)));
    expect(ascii(0)).toBe("RIFF");
    expect(ascii(8)).toBe("WAVE");
    expect(wav.getUint16(22, true)).toBe(1);
    expect(wav.getUint32(24, true)).toBe(24_000);
    expect(wav.getUint16(34, true)).toBe(16);
    expect(wav.getUint32(40, true)).toBe(6);
    expect(wav.getInt16(46, true)).toBe(0x7fff);
    expect(wav.getInt16(48, true)).toBe(-0x8000);
  });

  it("formats times", () => {
    expect(clock(4.2)).toBe("0:04.2");
    expect(clock(75)).toBe("1:15.0");
  });
});
