import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkAll, composite, parseColor, ratio, resolve, themeVars } from "../lib/ui/contrast";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("contrast maths", () => {
  it("matches the WCAG reference values", () => {
    expect(ratio(parseColor("#000")!, parseColor("#fff")!)).toBeCloseTo(21, 5);
    expect(ratio(parseColor("#777777")!, parseColor("#ffffff")!)).toBeCloseTo(4.48, 2);
  });

  it("parses space and comma rgb syntax with alpha", () => {
    expect(parseColor("rgb(255 255 255 / 0.64)")).toEqual({ r: 255, g: 255, b: 255, a: 0.64 });
    expect(parseColor("rgba(10, 20, 30, 50%)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
  });

  it("composites translucent white onto a colour", () => {
    const c = composite({ r: 255, g: 255, b: 255, a: 0.5 }, { r: 0, g: 0, b: 0, a: 1 });
    expect(c.r).toBeCloseTo(127.5);
  });
});

describe("Caseload tokens", () => {
  it("resolves var() chains in both themes", () => {
    expect(resolve(themeVars(css, "light"), "--bg")).toMatchObject({ r: 0xf5, g: 0xf3, b: 0xfc });
    expect(resolve(themeVars(css, "dark"), "--bg")).toMatchObject({ r: 0x10, g: 0x0d, b: 0x24 });
  });

  it("every used pair meets WCAG AA in light and dark", () => {
    const failures = checkAll(css)
      .filter((r) => !r.pass)
      .map((r) => `${r.theme} ${r.label}: ${r.ratio}:1 < ${r.min}`);
    expect(failures).toEqual([]);
  });
});
