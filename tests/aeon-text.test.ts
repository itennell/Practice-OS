import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AeonText, blocks } from "../components/aeon-text";

// Aeon's week answer, as Muse wrote it on Oct 28: a line of text under each numbered item.
const WEEK = [
  "Two things are coming up soon:",
  "",
  "1. BCBSIL application follow-up - Wed, Nov 4, in 6 days.",
  "You need to do this: call them or check the portal.",
  "",
  "2. CAQH re-attestation - Sat, Nov 7, in 9 days.",
  "You need to do this: log in and click Attest yourself.",
].join("\n");

describe("AeonText numbered lists", () => {
  it("keeps counting when a line of text splits the list", () => {
    const lists = blocks(WEEK).filter((b) => b.kind === "ol");
    expect(lists.map((b) => (b.kind === "ol" ? b.start : null))).toEqual([1, 2]);
    const html = renderToStaticMarkup(createElement(AeonText, { text: WEEK }));
    expect(html).toContain('<ol start="2"');
  });

  it("leaves an ordinary list starting at 1 without a start attribute", () => {
    const html = renderToStaticMarkup(createElement(AeonText, { text: "1. One\n2. Two" }));
    expect(html).not.toContain("start=");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });
});
