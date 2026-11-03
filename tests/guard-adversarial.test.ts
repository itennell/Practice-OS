// The wave-4 adversarial privacy table (Nov 2): leetspeak, misspellings,
// medical conditions, indirect identifiers and memory must be refused; the
// demo's professional and referral sentences must pass. The plain-code rules
// are checked on their own; the whole guard runs every case when the name
// model is downloaded.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PART_LEFT_OUT, guard, leetVariants, normalizeForCheck } from "../lib/aeon/guard";
import { checkIdentity, clinicalForMemory, foldTypos, medicalAboutSomeone } from "../lib/aeon/identity-filter";
import { NER_MODEL, modelCacheDir } from "../lib/aeon/phi-classifier";
import { DEMO_ALLOWED, MUST_PASS, MUST_REFUSE } from "./fixtures/guard-adversarial";

const haveModel = existsSync(path.join(modelCacheDir(), NER_MODEL));
const allow = {
  names: DEMO_ALLOWED.names.map(normalizeForCheck),
  contacts: DEMO_ALLOWED.contacts.map(normalizeForCheck),
  directory: DEMO_ALLOWED.directory.map(normalizeForCheck),
  places: DEMO_ALLOWED.places.map(normalizeForCheck),
};

/** What the plain-code rules alone say, on the cleaned text and each leet reading. */
function rulesRefuse(text: string, at: string): boolean {
  const plain = normalizeForCheck(text);
  const flat = (v: string) => [v, v.replace(/[ \t]*\n+[ \t]*/g, " ")];
  return [plain, ...leetVariants(plain)]
    .flatMap(flat)
    .some((v) => !checkIdentity(v, allow).ok || (at === "memory" && clinicalForMemory(v, allow.places)));
}

describe("adversarial table: size", () => {
  it("has at least 40 must-refuse and 25 must-pass lines", () => {
    expect(MUST_REFUSE.length).toBeGreaterThanOrEqual(40);
    expect(MUST_PASS.length).toBeGreaterThanOrEqual(25);
  });
});

describe("adversarial table: rules (no model)", () => {
  it.each(MUST_REFUSE.filter((c) => c.rules).map((c) => [c.text, c.at] as const))("refuses: %s [%s]", (text, at) => {
    expect(rulesRefuse(text, at)).toBe(true);
  });

  it.each(MUST_PASS.map((c) => [c.text, c.at] as const))("passes: %s [%s]", (text, at) => {
    expect(rulesRefuse(text, at)).toBe(false);
  });

  it("reads leetspeak both ways and leaves numbers, times and ordinals alone", () => {
    expect(leetVariants("My cl1ent S4rah K1ein")).toEqual(expect.arrayContaining(["My client Sarah Kiein", "My client Sarah Klein"]));
    expect(leetVariants("p@tient k!ll $arah")).toEqual(["patient kill sarah"]);
    expect(leetVariants("Book 4pm on the 1st, CPT 90837, ZIP 60614. Thanks!")).toEqual([]);
  });

  it("reads a misspelled cue word as the word, never a real word one letter away", () => {
    expect(foldTypos("my clinet has postpartum depresion")).toBe("my client has postpartum depression");
    expect(foldTypos("Patiant Cleint cancr")).toBe("Patient Client cancer");
    expect(foldTypos("cancel the patent addition for the dancer Clint")).toBe("cancel the patent addition for the dancer Clint");
  });

  it("counts a medical condition only when it is about one person", () => {
    expect(medicalAboutSomeone("my client just started chemo")).toBe(true);
    expect(medicalAboutSomeone("her breast cancer came back")).toBe(true);
    expect(medicalAboutSomeone("I help people with cancer")).toBe(false);
    expect(medicalAboutSomeone("Dr. Lee and her radiation oncology team")).toBe(false);
    expect(medicalAboutSomeone("She has worked with cancer patients for years")).toBe(false);
    expect(medicalAboutSomeone("Ask about their patient navigator at the cancer center")).toBe(false);
  });
});

describe.skipIf(!haveModel)("adversarial table: whole guard with the local name-finder", () => {
  it.each(MUST_REFUSE.map((c) => [c.text, c.at] as const))("refuses: %s [%s]", async (text, at) => {
    expect((await guard(text, at, DEMO_ALLOWED)).ok).toBe(false);
  });

  it.each(MUST_PASS.map((c) => [c.text, c.at] as const))("passes: %s [%s]", async (text, at) => {
    expect(await guard(text, at, DEMO_ALLOWED)).toEqual({ ok: true, text });
  });

  it("leaves out only the card that holds a client detail, not the whole reply", async () => {
    const reply = [
      "Here are three to reach out to this week:",
      "1. Brittany Keiser, MS, CGC - 0.9 miles away.",
      "2. Sam Rivera came in today for his second visit.",
      "3. [Sample] Rev. Tobias Wren - hospice chaplain, 1.4 mi.",
    ].join("\n");
    const r = await guard(reply, "reply", DEMO_ALLOWED);
    expect(r).toEqual({
      ok: true,
      text: [
        "Here are three to reach out to this week:",
        "1. Brittany Keiser, MS, CGC - 0.9 miles away.",
        `2. ${PART_LEFT_OUT}`,
        "3. [Sample] Rev. Tobias Wren - hospice chaplain, 1.4 mi.",
      ].join("\n"),
    });
  });

  it("drops one sentence of a one-paragraph reply", async () => {
    const reply = "Start with Claudia Tellez, MD, 0.6 mi away. Text 312-555-0199 for the intake. Then try Westside Oncology Partners.";
    const r = await guard(reply, "reply", DEMO_ALLOWED);
    expect(r).toEqual({ ok: true, text: `Start with Claudia Tellez, MD, 0.6 mi away. ${PART_LEFT_OUT} Then try Westside Oncology Partners.` });
  });

  it("holds back the whole reply for a health detail or a pinned-down client, never keeping the sentences around it", async () => {
    const spread = "Your client is 61. She lives in Lincoln Park. She has metastatic breast cancer. Brittany Keiser, MS, CGC can help.";
    expect((await guard(spread, "reply", DEMO_ALLOWED)).ok).toBe(false);
    const card = "Here are your next steps.\n1. Your Tuesday client Sarah Klein\n2. Started chemo last week\n3. Brittany Keiser, MS, CGC - 0.9 miles away\n4. Westside Oncology Partners - 1.2 mi away";
    const r = await guard(card, "reply", DEMO_ALLOWED);
    if (r.ok) {
      expect(r.text).not.toMatch(/chemo|Sarah|Klein/);
    }
  });

  it("holds back the whole reply when no one part is at fault, or most of it would go", async () => {
    // A street and a person on separate lines: each line passes alone, together they are a home address.
    expect(await guard("Mail it to 1200 W Fullerton Ave\nShe asked for it twice.", "reply", DEMO_ALLOWED)).toEqual({ ok: false, kind: "address" });
    const most = "Sam Rivera came in today for his visit.\nKevin Ortiz cancelled his intake.\nThanks.";
    expect((await guard(most, "reply", DEMO_ALLOWED)).ok).toBe(false);
  });

  it("never splits her own message or a memory: one bad part refuses it all", async () => {
    const text = "Draft a letter to Westside Oncology Partners.\nMy client has stage 3 breast cancer.";
    expect((await guard(text, "message", DEMO_ALLOWED)).ok).toBe(false);
    expect((await guard(text, "memory", DEMO_ALLOWED)).ok).toBe(false);
  });
});
