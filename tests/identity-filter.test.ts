import { describe, expect, it } from "vitest";
import { checkIdentity } from "../lib/aeon/identity-filter";
import { ALLOWED, PHI_CASES, type PhiCase } from "./fixtures/phi-corpus";

type Refuse = Extract<PhiCase, { expect: "refuse" }>;
const refuses = PHI_CASES.filter((c): c is Refuse => c.expect === "refuse");

const ruleCases = refuses.filter((c) => c.layer === "rules");
const nerCases = refuses.filter((c) => c.layer === "ner");
const passCases = PHI_CASES.filter((c) => c.expect === "pass");

describe("identity filter (layer 1, rules)", () => {
  it.each(ruleCases.map((c) => [c.text, c.category]))("refuses: %s (%s)", (text, category) => {
    expect(checkIdentity(text, ALLOWED)).toEqual({ ok: false, kind: category });
  });

  it.each(passCases.map((c) => [c.text]))("lets through: %s", (text) => {
    expect(checkIdentity(text, ALLOWED)).toEqual({ ok: true });
  });

  it("reports what the rules alone miss (bare names are layer 2's job)", () => {
    const missed = nerCases.filter((c) => checkIdentity(c.text, ALLOWED).ok);
    console.info(`[identity-filter] rules alone miss ${missed.length}/${nerCases.length} bare-name lines`);
    expect(ruleCases.length).toBeGreaterThanOrEqual(40);
    expect(passCases.length).toBeGreaterThanOrEqual(55);
  });
});
