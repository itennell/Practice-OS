import { describe, expect, it } from "vitest";
import { memoryMarkdown, rankMemories } from "../lib/aeon/memory";

const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const MEMORIES = [
  { kind: "preference" as const, text: "Prefers Tuesday afternoons for consults.", updated_at: at(1) },
  { kind: "decision" as const, text: "Does not take Medicaid.", updated_at: at(2) },
  { kind: "fact" as const, text: "Fee for 90837 is $175.", updated_at: at(3) },
  { kind: "fact" as const, text: "Office lease renews in March.", updated_at: at(4) },
  { kind: "what_worked" as const, text: "Posts about superbills got the most saves.", updated_at: at(5) },
];

describe("rankMemories", () => {
  it("always includes preferences and decisions, then the facts that match her message first", () => {
    const picked = rankMemories(MEMORIES, "What is my fee for 90837?");
    expect(picked.slice(0, 2).map((m) => m.kind)).toEqual(["preference", "decision"]);
    expect(picked[2].text).toBe("Fee for 90837 is $175.");
    expect(picked).toHaveLength(5);
  });

  it("stays inside the budget", () => {
    const picked = rankMemories(MEMORIES, "lease", 95);
    expect(picked.reduce((n, m) => n + m.text.length, 0)).toBeLessThanOrEqual(95);
    expect(picked.map((m) => m.text)).toContain("Office lease renews in March.");
  });
});

describe("memoryMarkdown", () => {
  it("groups by kind with dates and says where to edit", () => {
    const md = memoryMarkdown(MEMORIES);
    expect(md).toContain("## Preferences\n\n- Prefers Tuesday afternoons for consults. (2026-10-01)");
    expect(md).toContain("## What worked");
    expect(md).toMatch(/Memory page/);
  });
});
