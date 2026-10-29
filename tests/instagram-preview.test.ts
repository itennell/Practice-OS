// The feed preview cuts the caption like Instagram, before "more".
import { describe, expect, it } from "vitest";
import { shortCaption } from "../components/instagram/post-preview";

describe("shortCaption", () => {
  it("keeps a short one-line caption whole", () => {
    expect(shortCaption("Sessions are $150.")).toEqual({ text: "Sessions are $150.", cut: false });
  });
  it("cuts at the first line break, without a trailing period before the dots", () => {
    expect(shortCaption("Book a free call from the link in my bio.\n\nDana Reyes, LCPC")).toEqual({ text: "Book a free call from the link in my bio", cut: true });
  });
  it("cuts a long first line on a word", () => {
    const r = shortCaption(`${"word ".repeat(40)}end`);
    expect(r.cut).toBe(true);
    expect(r.text.length).toBeLessThanOrEqual(125);
    expect(r.text.endsWith("word")).toBe(true);
  });
});
