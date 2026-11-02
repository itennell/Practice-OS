// Nov 2 hardening of the sensitive-info guard (the review after PR #120).
// Default refuse, with few false blocks. The model-free rules are checked on
// their own; the whole guard runs every case when the name model is downloaded.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { guard, normalizeForCheck } from "../lib/aeon/guard";
import { checkIdentity, clinicalForMemory } from "../lib/aeon/identity-filter";
import { NER_MODEL, modelCacheDir, trimTitles } from "../lib/aeon/phi-classifier";
import { HARDENING } from "./fixtures/guard-hardening";
import { LEAK_ALLOWED } from "./fixtures/guard-leaks";

const haveModel = existsSync(path.join(modelCacheDir(), NER_MODEL));

describe("rules (no model)", () => {
  it.each([
    ["member ID XGH 123456789", "identifier"],
    ["Her Medicare MBI is 1EG4-TE5-MK73", "identifier"],
    ["1EG4-TE5-MK73", "identifier"],
    ["Aetna ID 4837201956 is her plan", "identifier"],
    ["MRN 4817", "identifier"],
    ["SSN 123.45.6789", "identifier"],
    ["123.45.6789", "identifier"],
    ["she lives in 60614", "address"],
    ["She lives at 2847 w fargo ave", "address"],
    ["2847 W FARGO AVE APT 3", "address"],
    ["王伟 wants Tuesdays", "client_name"],
    ["Иван Петров cancelled", "client_name"],
    ["She has MDD", "diagnosis"],
    ["Her trauma history makes Tuesdays hard", "diagnosis"],
    ["He has insomnia and wants mornings", "diagnosis"],
    ["My client has grief issues", "diagnosis"],
    ["Client has SUD", "diagnosis"],
    ["Use F411 on the superbill", "diagnosis"],
    ["dx GAD", "diagnosis"],
    ["diagnosed last spring, wants Tuesdays", "diagnosis"],
    ["Her spouse has anxiety", "diagnosis"],
    ["Her fiancé has PTSD", "diagnosis"],
    ["His coworker has anxiety", "diagnosis"],
    ["A client of mine has PTSD", "diagnosis"],
    ["I help her with her anxiety", "diagnosis"],
    ["the 9 year old from Lincoln Elementary", "client_name"],
    ["My 3 o’clock Sam no-showed", "client_name"],
    ["Her cell is 312/555/0199", "contact"],
    ["Her cell is 312•555•0199", "contact"],
    ["312_555_0199 is her cell", "contact"],
    ["Call 3125550199 tomorrow", "contact"],
    ["Her cell is 888-555-0199 and Aetna said to call", "contact"],
    ["nació el 14 de marzo de 1988", "birth_date"],
    ["dob 3 14 1988", "birth_date"],
    ["Mr. Dan owes two copays", "client_name"],
  ])("refuses: %s", (text, kind) => {
    expect(checkIdentity(normalizeForCheck(text), LEAK_ALLOWED)).toEqual({ ok: false, kind });
  });

  it.each([
    "My NPI is 1234567893",
    "I help someone with anxiety",
    "a teen with ADHD",
    "My ideal client struggles with anxiety",
    "I work with adults with PTSD",
    "Graduated 2006-05-14 from Loyola",
    "licensed 03/12/2008",
    "The BCBS provider line is 800-676-2583",
    "Cigna credentialing: 800-555-0177",
    "Use a G2211 add-on code with 90837",
    "Payers want a dx code on the claim",
    "I help newly diagnosed adults find a routine",
    "panic attacks every Tuesday at 4, rescheduling",
    "What treatment approach should I use with a client who has panic attacks?",
  ])("passes: %s", (text) => {
    expect(checkIdentity(normalizeForCheck(text), LEAK_ALLOWED)).toEqual({ ok: true });
  });

  it("keeps nameless clinical text out of memory, but not her niche", () => {
    expect(clinicalForMemory("panic attacks every Tuesday at 4, rescheduling")).toBe(true);
    expect(clinicalForMemory("I specialize in anxiety and depression")).toBe(false);
  });

  it("folds look-alike letters and spaced-out letters before the checks", () => {
    expect(normalizeForCheck("Кevin Ortiz")).toBe("Kevin Ortiz");
    expect(normalizeForCheck("K e v i n O r t i z cancelled")).toBe("Kevin Ortiz cancelled");
    expect(normalizeForCheck("Иван Петров")).toBe("Иван Петров");
  });

  it("drops a title or credential the model glues onto a name", () => {
    expect(trimTitles("Alan Brooks PhD")).toBe("Alan Brooks");
    expect(trimTitles("Dr Kevin Ortiz")).toBe("Kevin Ortiz");
    expect(trimTitles("Dr")).toBe("Dr");
  });
});

describe.skipIf(!haveModel)("guard with the local name-finder", () => {
  it.each(HARDENING.map((c) => [c.expect, c.text, c.at, c.full ?? false] as const))("%s: %s [%s]", async (want, text, at, full) => {
    const r = await guard(text, at, LEAK_ALLOWED, { fullRules: full });
    if (want === "refuse") expect(r.ok).toBe(false);
    else expect(r).toEqual({ ok: true, text });
  });

  it("withholds a long upload past the name-finder's second-read cap, with a plain reason", async () => {
    const rows = Array.from({ length: 40 }, (_, i) => `Row ${i}: Harbor Lantern ${String.fromCharCode(65 + (i % 26))}ovell Quarry met Tuesday.`);
    const long = rows.join("\n");
    expect(await guard(long, "tool_result", LEAK_ALLOWED, { failClosedWhenLong: true })).toEqual({ ok: false, kind: "too_long" });
    // Without the flag (official rule text), it is not refused for length: the first read covers every word.
    expect(await guard(long, "tool_result", LEAK_ALLOWED)).not.toEqual({ ok: false, kind: "too_long" });
  });
});
