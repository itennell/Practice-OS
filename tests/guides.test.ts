// How-do-i guides: every file parses, every rule's guide link points at a real
// guide, and the steps only the clinician can do are marked.
import { describe, expect, it } from "vitest";
import { SHIPPED_RULES } from "../lib/compliance/rules";
import { isOfficialUrl } from "../lib/compliance/validate";
import { allGuides, guideSlugs, parseGuide } from "../lib/guides";

describe("how-do-i guides", () => {
  const guides = allGuides();

  it("ships the five Part A guides", () => {
    expect(guideSlugs()).toEqual(["caqh-reattestation", "illinois-impact", "illinois-pllc", "medicare-pecos", "npi-type-1-vs-2"]);
  });

  it("every guide has numbered steps, marks her steps, and cites only official pages", () => {
    for (const g of guides) {
      const steps = g.sections.filter((s) => s.ordered).flatMap((s) => s.items);
      expect(steps.length, g.slug).toBeGreaterThanOrEqual(5);
      expect(steps.some((i) => i.you), g.slug).toBe(true);
      expect(isOfficialUrl(g.official_url), g.official_url).toBe(true);
      for (const s of g.sources) expect(isOfficialUrl(s.url), s.url).toBe(true);
    }
  });

  it("every rule's guide link has a guide", () => {
    const slugs = new Set(guideSlugs());
    for (const r of SHIPPED_RULES) if (r.guide) expect(slugs.has(r.guide), `${r.id} -> ${r.guide}`).toBe(true);
  });

  it("refuses a guide outside the format", () => {
    expect(() => parseGuide("x", "no frontmatter")).toThrow(/frontmatter/);
    const head = "---\ntitle: T\nsummary: S\nofficial_url: https://x.gov\nlast_verified: 2026-10-26\nsources:\n  - A | https://x.gov/a\n---\n";
    expect(() => parseGuide("x", `${head}## Steps\n1. ok\n<script>alert(1)</script>\n`)).toThrow(/unreadable line/);
    expect(() => parseGuide("x", `${head}## Notes\n- only bullets\n`)).toThrow(/numbered steps/);
  });
});
