// Nov 2 re-test and review of the sensitive-info guard. Default refuse: every
// exemption is narrow and positive. Leaks found by the PR #120 probe must be
// refused; the false blocks fixed in this PR must stay fixed. Exact outputs.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { PART_LEFT_OUT, blankNames, guard, titleCase } from "../lib/aeon/guard";
import { OFFICIAL_PHONES, checkIdentity } from "../lib/aeon/identity-filter";
import { NER_MODEL, isNameLike, modelCacheDir } from "../lib/aeon/phi-classifier";
import { FREE_TEXT_TOOLS, TOOLS_BY_NAME } from "../lib/aeon/tools";
import { toolEnabled } from "../lib/features";
import { ALLOWED } from "./fixtures/phi-corpus";
import { LEAKS, LEAK_ALLOWED, LEAK_DOCS } from "./fixtures/guard-leaks";

const haveModel = existsSync(path.join(modelCacheDir(), NER_MODEL));
const NOT_ON_BOARD = { names: ["Dana Reyes", "Reyes Counseling PLLC"], contacts: [] };

describe("masking works on whole words only", () => {
  it("never blanks a piece of a word", () => {
    // Before: "dr" was blanked inside "address" ("ad[name withheld]ess").
    expect(blankNames("Send it to the address on file.", ["Dr"])).toBe("Send it to the address on file.");
    expect(blankNames("Mail the address to Kevin Ortiz.", ["Kevin Ortiz"])).toBe("Mail the address to [name withheld].");
    expect(blankNames("Kevin Ortiz's new address", ["Kevin Ortiz"])).toBe("[name withheld]'s new address");
  });

  it("blanks a one-word name only where it is capitalized; a full name in any case", () => {
    expect(blankNames("A grace period applies. Grace called.", ["Grace"])).toBe("A grace period applies. [name withheld] called.");
    expect(blankNames("KEVIN ORTIZ and kevin ortiz", ["Kevin Ortiz"])).toBe("[name withheld] and [name withheld]");
  });

  it("titles, credentials and official document words are not names", () => {
    for (const w of ["Dr", "Dr.", "MD", "PhD", "Fee Schedule", "Physician Fee Schedule", "Child Abuse Hotline", "Couples"]) expect(isNameLike(w), w).toBe(false);
    for (const w of ["Zimmerman", "Kevin Ortiz", "Jenny Key", "Grace Park", "Gary Bucher"]) expect(isNameLike(w), w).toBe(true);
  });

  it("title-cases without changing length", () => {
    expect(titleCase("KEVIN ORTIZ and carin gordon")).toBe("Kevin Ortiz And Carin Gordon");
  });

  it("a title or document name the name-finder misreads leaves the answer whole (root cause, model stubbed)", async () => {
    vi.resetModules();
    vi.doMock("../lib/aeon/phi-classifier", async (load) => ({
      ...(await load<typeof import("../lib/aeon/phi-classifier")>()),
      findNames: async () => ["Dr", "Fee Schedule"],
    }));
    const { guard: stubbed } = await import("../lib/aeon/guard");
    const text = "Send it to the address on file. Dr. Zimmerman uses the CMS Physician Fee Schedule lookup.";
    expect(await stubbed(text, "reply", ALLOWED)).toEqual({ ok: true, text });
    vi.doUnmock("../lib/aeon/phi-classifier");
    vi.resetModules();
  });
});

describe("rules: topics pass, a person's details are refused", () => {
  it.each([
    "I mostly see adults with anxiety and burnout, many of them tech workers",
    "I mostly see adults with anxiety and burnout",
    "Dana Reyes, LCPC, works with adults facing anxiety, depression and burnout. She specializes in life transitions and stress at work.",
    "In Illinois, mandated reporters call the DCFS Child Abuse Hotline at 1-800-252-2873 (1-800-25-ABUSE). If a child is in immediate danger, call 911.",
    "You must report when you have reasonable cause to believe a child known to you in your professional capacity may be abused or neglected, including signs of self-harm.",
    "CPT 90839 is crisis psychotherapy, first 60 minutes. Payers want a diagnosis code on the claim.",
    "Call Aetna provider services at 1-855-745-5507.",
    "My NPI is 1234567893",
    "Your Good Faith Estimate for the first visit on 11/12/2026 is ready.",
    "Your license renews on 6/30/2027.",
  ])("passes: %s", (text) => {
    expect(checkIdentity(text, ALLOWED)).toEqual({ ok: true });
  });

  it.each([
    ["My client Sam, a tech worker, has anxiety", "diagnosis"],
    ["She has PTSD and wants a GFE", "diagnosis"],
    ["they have OCD and want a GFE", "diagnosis"],
    ["her schizophrenia makes Fridays hard", "diagnosis"],
    ["patient with major depressive disorder wants weekly", "diagnosis"],
    ["Intake summary\nDiagnosis: Major depressive disorder, recurrent\nPlan: weekly sessions", "diagnosis"],
    ["J.R. has anxiety.", "diagnosis"],
    ["JR has panic disorder and wants Tuesdays.", "diagnosis"],
    ["The teen has ADHD and missed two sessions.", "diagnosis"],
    ["The 34-year-old has bipolar disorder.", "diagnosis"],
    ["The toddler has autism.", "diagnosis"],
    ["the guy on Tuesdays has anxiety", "diagnosis"],
    ["Her nephew has OCD", "diagnosis"],
    ["Client: J. Doe\nDOB: 03/14/1988\nDx: F41.1", "birth_date"],
    ["Born 14 March 1988", "birth_date"],
    ["14 March 1988 canceled her Tuesday visit", "birth_date"],
    ["Her son (3-14-15) canceled her Tuesday visit", "birth_date"],
    ["(3/14/2015) canceled her Tuesday visit", "birth_date"],
    ["She turned 40 on March 14, 2026", "birth_date"],
    ["Born in 1988, she canceled her Tuesday visit", "birth_date"],
    ["call him back at (773) 555-0198", "contact"],
    ["Her cell is 888-555-0199, she wants a visit", "contact"],
    ["Her number is 3125550199 and she wants a visit", "contact"],
    ["Her number is 312 5550199 and she wants a visit", "contact"],
    ["She lives at 1200 W Fullerton Av.", "address"],
    ["She lives at 1200 Fullerton Apt 4", "address"],
    ["Her ZIP is 60614 and her address is 1200 Fullerton", "address"],
    ["Her insurance member ID is ABC123456789", "identifier"],
    ["My client Gary Bucher wants a superbill", "client_name"],
    ["The 3pm, Jess, is running late", "client_name"],
  ])("refuses: %s", (text, kind) => {
    expect(checkIdentity(text, ALLOWED)).toEqual({ ok: false, kind });
  });

  it("official phone numbers are an exact list that covers every payer number in data/payers", () => {
    const dir = path.join(__dirname, "..", "data", "payers");
    const found = readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => [...readFileSync(path.join(dir, f), "utf8").matchAll(/(?:1-)?\(?8\d{2}\)?[\s.-]\d{3}[\s.-]\d{4}/g)].map((m) => m[0].replace(/\D/g, "").slice(-10)));
    expect(found.length).toBeGreaterThan(0);
    for (const n of found) expect(OFFICIAL_PHONES.has(n), n).toBe(true);
    // A toll-free shape alone is not enough (the PR #120 review leak).
    expect(OFFICIAL_PHONES.has("8885550199")).toBe(false);
  });

  it("every free-text tool is a real tool", () => {
    // Front Desk tools are paused and the referrals-only demo hides most (lib/features.ts), so only switched-on ones are in the registry.
    for (const name of FREE_TEXT_TOOLS) if (toolEnabled(name)) expect(TOOLS_BY_NAME.has(name), name).toBe(true);
  });
});

describe.skipIf(!haveModel)("guard with the local name-finder", () => {
  it.each(LEAKS)("refuses the probe leak: %s [%s]", async (text, at) => {
    expect((await guard(text, at, LEAK_ALLOWED)).ok).toBe(false);
  });

  it.each(LEAK_DOCS)("withholds the probe document: %s", async (text) => {
    expect((await guard(text, "tool_result", LEAK_ALLOWED, { fullRules: true })).ok).toBe(false);
  });

  it.each([
    "Check the CMS Physician Fee Schedule lookup for 90837.",
    "In Illinois, mandated reporters call the DCFS Child Abuse Hotline at 1-800-252-2873 (1-800-25-ABUSE). If a child is in immediate danger, call 911.",
    "Under the Abused and Neglected Child Reporting Act (325 ILCS 5/4), licensed clinicians are mandated reporters. Reports go to the Illinois Department of Children and Family Services (DCFS).",
    "Dana Reyes, LCPC, works with adults facing anxiety, depression and burnout. She specializes in life transitions and stress at work.",
    "Book your first session with Dana Reyes, LCPC.",
    "Your board has a provider near you: Gary Bucher, LCPC. His office phone is (312) 555-0142.",
    "Your Good Faith Estimate for the first visit on 11/12/2026 is ready.",
  ])("keeps the reply whole: %s", async (text) => {
    expect(await guard(text, "reply", LEAK_ALLOWED)).toEqual({ ok: true, text });
  });

  it.each([
    "Who do I report child abuse to in Illinois?",
    "What are my mandated reporter duties for child abuse in Illinois?",
    "How do I bill for a suicide risk assessment (CPT 90839)?",
    "what's the status of Gary Bucher's card",
    "find cards named Bucher",
    "Draft a referral letter to Carin Gordon about my new practice",
    "I mostly see adults with anxiety and burnout, many of them tech workers",
    "Check the CMS Physician Fee Schedule lookup for 90837.",
  ])("lets her message through: %s", async (text) => {
    expect(await guard(text, "message", LEAK_ALLOWED)).toEqual({ ok: true, text });
  });

  it("a titled stranger is blanked as a whole word, the title and 'address' stay", async () => {
    expect(await guard("Send it to the address on file. Dr. Zimmerman takes Aetna.", "reply", ALLOWED)).toEqual({
      ok: true,
      text: "Send it to the address on file. Dr. [name withheld] takes Aetna.",
    });
    expect(await guard('{"note":"Kevin Ortiz changed his address"}', "tool_result", ALLOWED)).toEqual({
      ok: true,
      text: '{"note":"[name withheld] changed his address"}',
    });
  });

  it("a board name passes only in a referral context, and only as a whole name", async () => {
    const ask = "what's the status of Gary Bucher's card";
    expect(await guard(ask, "message", NOT_ON_BOARD)).toEqual({ ok: false, kind: "client_name" });
    expect(await guard("my client Gary Bucher", "message", LEAK_ALLOWED)).toEqual({ ok: false, kind: "client_name" });
    expect(await guard("Gary Bucher was born 3/14/1988", "message", LEAK_ALLOWED)).toEqual({ ok: false, kind: "birth_date" });
    expect(await guard("Gary Bucher has bipolar disorder", "message", LEAK_ALLOWED)).toEqual({ ok: false, kind: "diagnosis" });
    expect(await guard("My client Sam, a tech worker, has anxiety", "message", LEAK_ALLOWED)).toEqual({ ok: false, kind: "diagnosis" });
  });

  it("a stranger's phone in a reply is left out; a board phone isn't", async () => {
    const reply = "Your board has a provider near you: Gary Bucher, LCPC. His office phone is (312) 555-0188.";
    // Only the sentence with the phone goes (Nov 3: one part shouldn't blank the whole reply).
    expect(await guard(reply, "reply", LEAK_ALLOWED)).toEqual({ ok: true, text: `Your board has a provider near you: Gary Bucher, LCPC. ${PART_LEFT_OUT}` });
    expect(await guard("His office phone is (312) 555-0188.", "reply", LEAK_ALLOWED)).toEqual({ ok: false, kind: "contact" });
    const allow = { ...LEAK_ALLOWED, contacts: [...LEAK_ALLOWED.contacts, "(312) 555-0188"] };
    expect(await guard(reply, "reply", allow)).toEqual({ ok: true, text: reply });
  });
});
