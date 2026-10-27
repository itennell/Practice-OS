import { describe, expect, it } from "vitest";
import { initials, toneFor } from "../components/shared/avatar-initials";

describe("avatar initials", () => {
  it("takes the first and last word, ignoring credentials and [Sample]", () => {
    expect(initials("Dana Reyes, LCPC")).toBe("DR");
    expect(initials("[Sample] Sam Example")).toBe("SE");
    expect(initials("Mary Ann de la Cruz")).toBe("MC");
  });

  it("uses one letter for one word and none for a phone number", () => {
    expect(initials("Lakeview")).toBe("L");
    expect(initials("(312) 555-0142")).toBe("");
    expect(initials("")).toBe("");
  });

  it("handles letters beyond English", () => {
    expect(initials("José Álvarez")).toBe("JÁ");
  });
});

describe("avatar tone", () => {
  it("is stable for the same name and ignores credentials", () => {
    expect(toneFor("Sam Example")).toBe(toneFor("[Sample] Sam Example, LCSW"));
  });

  it("spreads names across the tones", () => {
    const names = ["Sam Example", "Lakeview Family Medicine", "Jordan Lee", "Priya Patel", "Alex Kim", "Chris Moore", "Taylor Diaz", "Morgan Fox"];
    expect(new Set(names.map(toneFor)).size).toBeGreaterThanOrEqual(3);
  });
});
