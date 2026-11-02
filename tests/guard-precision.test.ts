// Nov 2 re-test of the sensitive-info guard: masking hit pieces of words,
// practice and legal answers were held back, and a provider on her Referrals
// board was refused as a client. Each case is checked both ways, with exact output.
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { blankNames, guard } from "../lib/aeon/guard";
import { checkIdentity } from "../lib/aeon/identity-filter";
import { NER_MODEL, isNameLike, modelCacheDir } from "../lib/aeon/phi-classifier";
import { ALLOWED } from "./fixtures/phi-corpus";

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

  it("a title or document name the name-finder misreads leaves the answer whole (root cause, model stubbed)", async () => {
    vi.resetModules();
    vi.doMock("../lib/aeon/phi-classifier", async (load) => ({
      ...(await load<typeof import("../lib/aeon/phi-classifier")>()),
      findNames: async () => ["Dr", "Fee Schedule", "Zimmerman"],
    }));
    const { guard: stubbed } = await import("../lib/aeon/guard");
    const text = "Send it to the address on file. Dr. Zimmerman uses the CMS Physician Fee Schedule lookup.";
    expect(await stubbed(text, "reply", ALLOWED)).toEqual({ ok: true, text });
    vi.doUnmock("../lib/aeon/phi-classifier");
    vi.resetModules();
  });
});

describe("rules: topics pass, a person's diagnosis or contact is refused", () => {
  it.each([
    "I mostly see adults with anxiety and burnout, many of them tech workers",
    "I mostly see adults with anxiety and burnout",
    "Dana Reyes, LCPC, works with adults facing anxiety, depression and burnout. She specializes in life transitions and stress at work.",
    "In Illinois, mandated reporters call the DCFS Child Abuse Hotline at 1-800-252-2873 (1-800-25-ABUSE). If a child is in immediate danger, call 911.",
    "You must report when you have reasonable cause to believe a child known to you in your professional capacity may be abused or neglected, including signs of self-harm.",
    "CPT 90839 is crisis psychotherapy, first 60 minutes. Payers want a diagnosis code on the claim.",
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
    ["Client: J. Doe\nDOB: 03/14/1988\nDx: F41.1", "birth_date"],
    ["call him back at (773) 555-0198", "contact"],
    ["My client Gary Bucher wants a superbill", "client_name"],
  ])("refuses: %s", (text, kind) => {
    expect(checkIdentity(text, ALLOWED)).toEqual({ ok: false, kind });
  });
});

describe.skipIf(!haveModel)("guard with the local name-finder", () => {
  it.each([
    "Send it to the address on file. Dr. Zimmerman takes Aetna.",
    "Check the CMS Physician Fee Schedule lookup for 90837.",
    "Dr. M. Zimmerman and Dr. Ruth Zimmerman-Lee both take Blue Cross.",
    "In Illinois, mandated reporters call the DCFS Child Abuse Hotline at 1-800-252-2873 (1-800-25-ABUSE). If a child is in immediate danger, call 911.",
    "Under the Abused and Neglected Child Reporting Act (325 ILCS 5/4), licensed clinicians are mandated reporters. Reports go to the Illinois Department of Children and Family Services (DCFS).",
    "Dana Reyes, LCPC, works with adults facing anxiety, depression and burnout. She specializes in life transitions and stress at work.",
  ])("keeps the reply whole: %s", async (text) => {
    expect(await guard(text, "reply", ALLOWED)).toEqual({ ok: true, text });
  });

  it("blanks a stranger's name in a tool result as a whole word", async () => {
    expect(await guard('{"note":"Kevin Ortiz changed his address"}', "tool_result", ALLOWED)).toEqual({
      ok: true,
      text: '{"note":"[name withheld] changed his address"}',
    });
  });

  it("lets her population answer through, and still refuses a client's diagnosis", async () => {
    const focus = "I mostly see adults with anxiety and burnout, many of them tech workers";
    expect(await guard(focus, "message", ALLOWED)).toEqual({ ok: true, text: focus });
    expect(await guard("My client Sam, a tech worker, has anxiety", "message", ALLOWED)).toEqual({ ok: false, kind: "diagnosis" });
    expect(await guard("Kevin Ortiz has PTSD", "reply", ALLOWED)).toEqual({ ok: false, kind: "diagnosis" });
  });

  it("a provider on her Referrals board passes as directory data, not as a client", async () => {
    const ask = "what's the status of Gary Bucher's card";
    expect(await guard(ask, "message", ALLOWED)).toEqual({ ok: true, text: ask });
    expect(await guard(ask, "message", NOT_ON_BOARD)).toEqual({ ok: false, kind: "client_name" });
    expect(await guard("find cards named Bucher", "message", ALLOWED)).toEqual({ ok: true, text: "find cards named Bucher" });
    expect(await guard("my client Gary Bucher", "message", ALLOWED)).toEqual({ ok: false, kind: "client_name" });
    expect(await guard("Gary Bucher missed his session", "message", ALLOWED)).toEqual({ ok: false, kind: "client_name" });
    expect(await guard("Gary Bucher was born 3/14/1988", "message", ALLOWED)).toEqual({ ok: false, kind: "birth_date" });
    expect(await guard("Gary Bucher has bipolar disorder", "message", ALLOWED)).toEqual({ ok: false, kind: "diagnosis" });
  });

  it("a provider list from a referral search stays whole when the providers are on her board", async () => {
    const allow = { ...ALLOWED, contacts: [...ALLOWED.contacts, "(312) 555-0188"] };
    const reply = "I found Gary Bucher, LCPC, near you. His office number is (312) 555-0188.";
    expect(await guard(reply, "reply", allow)).toEqual({ ok: true, text: reply });
    expect(await guard(reply, "reply", ALLOWED)).toEqual({ ok: false, kind: "contact" });
  });
});
