// The whole guard (rules + local name-finder) against the labeled corpus.
// Needs the model in .cache/models (`npm run models:download`); skipped with a
// note when it isn't there, so CI without the download still runs layer 1.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REFUSAL, WITHHELD, guard, isAllowedPerson } from "../lib/aeon/guard";
import { checkIdentity } from "../lib/aeon/identity-filter";
import { NER_MODEL, findNames, mergeEntities, modelCacheDir } from "../lib/aeon/phi-classifier";
import { ALLOWED, PHI_CASES, type PhiCase } from "./fixtures/phi-corpus";

const haveModel = existsSync(path.join(modelCacheDir(), NER_MODEL));
type Refuse = Extract<PhiCase, { expect: "refuse" }>;
const refuses = PHI_CASES.filter((c): c is Refuse => c.expect === "refuse");
const passes = PHI_CASES.filter((c) => c.expect === "pass");

describe("mergeEntities", () => {
  it("joins word pieces into one name", () => {
    const merged = mergeEntities([
      { entity: "B-PER", word: "Ta", score: 0.99 },
      { entity: "I-PER", word: "##sha", score: 0.98 },
      { entity: "I-PER", word: "Green", score: 0.99 },
    ]);
    expect(merged).toEqual([{ label: "PER", text: "Tasha Green", score: 0.98 }]);
  });

  it("drops a word whose pieces disagree (Aetna is not a person)", () => {
    const merged = mergeEntities([
      { entity: "B-PER", word: "A", score: 0.84 },
      { entity: "I-ORG", word: "##etna", score: 0.78 },
    ]);
    expect(merged[0].label).toBe("MIXED");
  });
});

describe("isAllowedPerson", () => {
  it.each([
    ["Dana", "Remember Dana likes Tuesdays"],
    ["Alan Brooks", "Dr. Alan Brooks might refer to me"],
    ["Jenna Cho", "Jenna Cho, LCSW, covers for me"],
    ["Marcus Bell", "Marcus Bell sends me referrals"],
  ])("allows %s", (name, text) => expect(isAllowedPerson(name, text, ALLOWED)).toBe(true));

  it("does not allow a stranger", () => {
    expect(isAllowedPerson("Maria", "Maria cancelled again", ALLOWED)).toBe(false);
  });
});

describe("guard fails closed", () => {
  it("refuses when the name-finder can't load, with no model call", async () => {
    vi.resetModules();
    vi.doMock("../lib/aeon/phi-classifier", () => ({ findNames: () => Promise.reject(new Error("model missing")) }));
    const { guard: guardWithoutModel } = await import("../lib/aeon/guard");
    expect(await guardWithoutModel("What needs me this week?", "message", ALLOWED)).toEqual({ ok: false, kind: "unavailable" });
    vi.doUnmock("../lib/aeon/phi-classifier");
  });

  it("has a fixed line for every kind that never echoes anything", () => {
    for (const line of Object.values(REFUSAL)) expect(line).not.toMatch(/\{|\$/);
    expect(WITHHELD).toMatch(/withheld/);
  });
});

describe.skipIf(!haveModel)("guard with the local name-finder", () => {
  it.each(refuses.map((c) => [c.text, c.category, c.layer]))("refuses: %s (%s, %s)", async (text) => {
    expect((await guard(text, "message", ALLOWED)).ok).toBe(false);
  });

  it.each(passes.map((c) => [c.text]))("lets through: %s", async (text) => {
    expect(await guard(text, "message", ALLOWED)).toEqual({ ok: true, text });
  });

  it("blanks strangers' names in a tool result instead of dropping it", async () => {
    const result = await guard('{"note":"Kevin Ortiz asked about fees","fee":175}', "tool_result", ALLOWED);
    expect(result).toEqual({ ok: true, text: '{"note":"[name withheld] asked about fees","fee":175}' });
  });

  it("prints the catch rate and false-refusal rate per layer", async () => {
    const rows: string[] = [];
    for (const layer of ["rules", "names", "both"] as const) {
      const caught = await Promise.all(
        refuses.map(async (c) => {
          if (layer === "rules") return !checkIdentity(c.text, ALLOWED).ok;
          if (layer === "names") return (await findNames(c.text)).some((n) => !isAllowedPerson(n, c.text, ALLOWED));
          return !(await guard(c.text, "message", ALLOWED)).ok;
        }),
      );
      const wrong = await Promise.all(passes.map(async (c) => !(await guard(c.text, "message", ALLOWED)).ok));
      const pct = (n: number, d: number) => `${Math.round((100 * n) / d)}%`;
      rows.push(
        `${layer.padEnd(5)} catches ${pct(caught.filter(Boolean).length, refuses.length)} of ${refuses.length}` +
          (layer === "both" ? `, wrongly refuses ${pct(wrong.filter(Boolean).length, passes.length)} of ${passes.length}` : ""),
      );
    }
    console.info(`[guard] ${rows.join(" | ")}`);
  });
});

if (!haveModel) console.info(`[guard] ${NER_MODEL} not downloaded: run npm run models:download to test layer 2`);
