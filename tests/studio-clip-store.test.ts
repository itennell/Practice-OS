// The browser clips storage cap, on its own: files must fit under it.
import { describe, expect, it } from "vitest";
import { CAP_FULL, fitsCap, MAX_CLIP_BYTES, sweepable, SWEEP_GRACE_MS } from "../components/studio/clip-store";

describe("studio clip storage cap", () => {
  it("a file fits until usage plus the file passes 500 MB", () => {
    expect(MAX_CLIP_BYTES).toBe(500 * 1024 * 1024);
    expect(fitsCap(0, 100 * 1024 * 1024)).toBe(true);
    expect(fitsCap(MAX_CLIP_BYTES - 1, 1)).toBe(true);
    expect(fitsCap(MAX_CLIP_BYTES, 1)).toBe(false);
    expect(fitsCap(MAX_CLIP_BYTES - 100, 101)).toBe(false);
  });

  // Review (PR #109, second pass): removing a clip doesn't free room at once, so the message doesn't say it does.
  it("the full-storage message doesn't promise that removing a clip frees room", () => {
    expect(CAP_FULL).toMatch(/500 MB/);
    expect(CAP_FULL).not.toMatch(/remove/i);
  });
});

describe("studio clip sweep", () => {
  const now = 1_000_000_000;
  const old = now - SWEEP_GRACE_MS - 1;
  it("deletes files no project or kept step uses, once they're past the grace period", () => {
    const entries = [
      { key: "a.mp4", modified: old },
      { key: "b.mp4", modified: old },
      { key: "c.mp4", modified: now - 1000 },
    ];
    expect(sweepable(entries, ["a.mp4"], now)).toEqual(["b.mp4"]);
    // A file just saved (an add whose edit hasn't landed yet) is never swept.
    expect(sweepable(entries, [], now)).toEqual(["a.mp4", "b.mp4"]);
    expect(sweepable(entries, ["a.mp4", "b.mp4", "c.mp4"], now)).toEqual([]);
  });
});
