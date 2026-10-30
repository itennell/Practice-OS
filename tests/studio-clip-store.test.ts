// The browser clips storage cap, on its own: files must fit under it.
import { describe, expect, it } from "vitest";
import { fitsCap, MAX_CLIP_BYTES } from "../components/studio/clip-store";

describe("studio clip storage cap", () => {
  it("a file fits until usage plus the file passes 500 MB", () => {
    expect(MAX_CLIP_BYTES).toBe(500 * 1024 * 1024);
    expect(fitsCap(0, 100 * 1024 * 1024)).toBe(true);
    expect(fitsCap(MAX_CLIP_BYTES - 1, 1)).toBe(true);
    expect(fitsCap(MAX_CLIP_BYTES, 1)).toBe(false);
    expect(fitsCap(MAX_CLIP_BYTES - 100, 101)).toBe(false);
  });
});
