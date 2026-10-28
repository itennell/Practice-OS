import { describe, expect, it } from "vitest";
import {
  ETHER_PALETTES,
  MAX_DPR,
  capDpr,
  etherPalette,
  hexToRgb01,
  renderSize,
  stillBackground,
} from "../components/shared/liquid-ether";

describe("liquid ether helpers", () => {
  it("picks the calm palette per theme", () => {
    expect(etherPalette(false).base).toBe("#FAF9F5");
    expect(etherPalette(true).base).toBe("#262624");
    expect(etherPalette(true).tints.map((t) => t.hex)).toEqual(expect.arrayContaining(["#8E7CF8", "#4E69DA"]));
  });

  it("keeps every tint low-intensity", () => {
    for (const p of [ETHER_PALETTES.light, ETHER_PALETTES.dark]) {
      for (const t of p.tints) {
        expect(t.alpha).toBeGreaterThan(0);
        expect(t.alpha).toBeLessThanOrEqual(0.9);
      }
      // The purple / blue accents stay faint.
      for (const t of p.tints.filter((t) => ["#8E7CF8", "#4E69DA"].includes(t.hex))) expect(t.alpha).toBeLessThanOrEqual(0.2);
    }
  });

  it("caps the pixel ratio and handles junk", () => {
    expect(capDpr(1)).toBe(1);
    expect(capDpr(3)).toBe(MAX_DPR);
    expect(capDpr(0)).toBe(1);
    expect(capDpr(undefined)).toBe(1);
    expect(capDpr(Number.NaN)).toBe(1);
  });

  it("renders at half resolution, never zero", () => {
    expect(renderSize(1000, 800, 1)).toEqual([500, 400]);
    expect(renderSize(1000, 800, 3)).toEqual([750, 600]);
    expect(renderSize(0, 0, 2)).toEqual([1, 1]);
  });

  it("parses hex colours", () => {
    expect(hexToRgb01("#FFFFFF")).toEqual([1, 1, 1]);
    expect(hexToRgb01("#000000")).toEqual([0, 0, 0]);
    expect(() => hexToRgb01("lilac")).toThrow();
  });

  it("builds a still gradient in the same colours", () => {
    const css = stillBackground(ETHER_PALETTES.dark);
    expect(css.endsWith("#262624")).toBe(true);
    expect(css).toContain("rgb(142 124 248 / 0.16)");
    expect(css.match(/radial-gradient/g)).toHaveLength(3);
  });
});
