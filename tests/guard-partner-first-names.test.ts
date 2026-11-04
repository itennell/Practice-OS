// "Set a meeting with Maria, Pamela and Birinder": board partners named by first name or
// surname. The real guard and the real local name-finder (no stubs). The name-finder reads
// "Maria, Pamela" as one name and cuts "Birinder" short ("Maria Pamela Biri"), so each name
// is resolved against the people on her board first (lib/aeon/guard.ts partnerMatch): one
// card passes, two or more ask which, none is refused as before. Fictional cards only.
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const { guard, partnerMatch, whichPartner, looksLikePerson, spokenName } = await import("../lib/aeon/guard");
const { withContext } = await import("../lib/referrals/ask-context");
const { COMMON_BOARD, REVIEW_MUST_PASS, REVIEW_MUST_REFUSE, ROUND2_MUST_PASS, ROUND2_MUST_REFUSE, ROUND3_MUST_PASS, ROUND3_MUST_REFUSE, ROUND4_MUST_PASS, ROUND4_MUST_REFUSE } = await import("./fixtures/partner-first-names");
const { DEMO_ALLOWED, MUST_REFUSE: ADVERSARIAL_REFUSE } = await import("./fixtures/guard-adversarial");

const BOARD = ["[Sample] Maria Halvorsen, MS", "[Sample] Pamela Serrano Vidal, MD", "[Sample] Birinder Malhi, MD", "[Sample] Juniper Row Family Medicine"];
const OWN = ["Dana Reyes", "Reyes Counseling PLLC"];
const allow = { names: [...OWN, ...BOARD], contacts: [], directory: BOARD };
// Stored the way a manual card or an older NPPES import can be: capitals, credentials, no label.
const UPPER = ["MARIA HALVORSEN, MS, CGC", "PAMELA SERRANO VIDAL MD", "Dr. Birinder Malhi"];
const upperAllow = { names: [...OWN, ...UPPER], contacts: [], directory: UPPER };
const TWO_MARIAS = [...BOARD, "[Sample] Maria Okafor, LCSW"];
const twoMarias = { names: [...OWN, ...TWO_MARIAS], contacts: [], directory: TWO_MARIAS };
const PICKED = [{ id: "00000000-0000-4000-8000-000000000301", name: BOARD[0] }];

const ASK = { askWhichPartner: true } as const;
const T = 240_000;

const MUST_PASS = [
  "set a meeting with Maria, Pamela and Birinder",
  "Set a meeting with Maria, Pamela and Birinder",
  "plan coffees with Maria and Pamela next week",
  "call Birinder Thursday",
  "set up a meeting with Dr. Malhi",
  "email Halvorsen",
  "Maria, Pamela, Birinder: meetings next week",
  "Can you book lunch with Pamela and Birinder on Friday?",
  "Coffee with Maria next Tuesday at 10",
  "set up coffee with Halvorsen and Malhi",
  "meet Birinder and Maria next week please",
  "Remind me to follow up with Pamela after our meeting",
  "Plan a lunch talk with Dr. Serrano Vidal's team",
  "Set meetings with Maria Halvorsen and Birinder Malhi",
  "set up a meeting with Birinder about palliative care referrals",
];
const LOWER = ["set a meeting with maria, pamela and birinder", "call birinder thursday", "email halvorsen", "MARIA, PAMELA AND BIRINDER: set meetings"];

const MUST_REFUSE = [
  "set a meeting with Joe",
  "Set a meeting with Maria, Pamela and Kevin",
  "set a meeting with Maria Smith",
  "my client Maria wants a meeting",
  "Maria has stage 3 cancer",
  "Pamela's patient Kevin",
  "Pamela's husband is in hospice",
  "Maria wants Tuesdays after 5",
  "my client Birinder needs a psychiatrist",
];

describe("board partners by first name or surname", () => {
  it("reads the board: people, not organizations; names as she'd say them", () => {
    expect(looksLikePerson("Maria Halvorsen, MS")).toBe(true);
    expect(looksLikePerson("Juniper Row Family Medicine")).toBe(false);
    expect(looksLikePerson("Northwestern Medicine")).toBe(false);
    expect(spokenName("[Sample] Dr. Birinder Malhi, MD")).toBe("Birinder Malhi");
    expect(spokenName("PAMELA SERRANO VIDAL MD")).toBe("Pamela Serrano Vidal");
    expect(whichPartner("maria", ["Maria Halvorsen", "Maria Okafor"])).toBe(
      "Which Maria do you mean: Maria Halvorsen or Maria Okafor? Ask again with their full name, or pick the card on Referrals.",
    );
  });

  it("resolves a merged or cut-short name to one card per person", () => {
    const text = "Maria, Pamela, Birinder: meetings next week";
    expect(partnerMatch("Maria Pamela Biri", text, allow)).toEqual({ kind: "partners", cards: [BOARD[0], BOARD[1], BOARD[2]] });
    // Written as one name with a word not on the card: a stranger.
    expect(partnerMatch("Maria Smith", "set a meeting with Maria Smith", allow)).toEqual({ kind: "none" });
    expect(partnerMatch("Maria", "set a meeting with Maria Smith", allow)).toEqual({ kind: "none" });
    expect(partnerMatch("Maria", "my client Maria wants a meeting", allow)).toEqual({ kind: "none" });
    expect(partnerMatch("Maria", "coffee with Maria", twoMarias)).toMatchObject({ kind: "ambiguous", choices: ["Maria Halvorsen", "Maria Okafor"] });
  });

  it.each(MUST_PASS)("passes: %s", async (m) => {
    const r = await guard(m, "message", allow, ASK);
    expect(r, m).toEqual({ ok: true, text: m });
    const c = await guard(withContext(m, "Partners", PICKED), "message", allow, ASK);
    expect(c.ok, `with Ask Aeon context: ${m}`).toBe(true);
  }, T);

  it.each(LOWER)("passes in any case: %s", async (m) => {
    expect((await guard(m, "message", allow, ASK)).ok, m).toBe(true);
    expect((await guard(m, "message", upperAllow, ASK)).ok, `board in capitals: ${m}`).toBe(true);
  }, T);

  it("passes with the board stored in capitals or with credentials", async () => {
    for (const m of ["set a meeting with Maria, Pamela and Birinder", "email Halvorsen", "set up a meeting with Dr. Malhi"]) {
      expect((await guard(m, "message", upperAllow, ASK)).ok, m).toBe(true);
    }
  }, T);

  it.each(MUST_REFUSE)("still refuses: %s", async (m) => {
    for (const text of [m, withContext(m, "Partners", PICKED)]) {
      const r = await guard(text, "message", allow, ASK);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.kind, text).not.toBe("ambiguous_partner");
    }
  }, T);

  it.each(["set a meeting with Maria", "coffee with maria next week", "set a meeting with Maria, Pamela and Birinder"])(
    "asks which when two cards share the name: %s",
    async (m) => {
      for (const text of [m, withContext(m, "Partners", PICKED)]) {
        const r = await guard(text, "message", twoMarias, ASK);
        expect(r).toEqual({
          ok: false,
          kind: "ambiguous_partner",
          question: "Which Maria do you mean: Maria Halvorsen or Maria Okafor? Ask again with their full name, or pick the card on Referrals.",
        });
      }
    },
    T,
  );

  it("a shared first name with a client cue or a stranger is refused, not asked about", async () => {
    for (const m of ["my client Maria wants a meeting", "set a meeting with Maria and Joe", "Maria has stage 3 cancer"]) {
      const r = await guard(m, "message", twoMarias, ASK);
      expect(r.ok, m).toBe(false);
      if (!r.ok) expect(r.kind, m).not.toBe("ambiguous_partner");
    }
  }, T);

  it("asks only at her chat message: other callers judge the name as before", async () => {
    const r = await guard("coffee with Maria", "message", twoMarias);
    if (!r.ok) expect(r.kind).not.toBe("ambiguous_partner");
  }, T);

  // The PR #153 review: one partner named John must never clear "John is grieving his father".
  const common = { names: [...OWN, ...COMMON_BOARD], contacts: [], directory: COMMON_BOARD };

  it.each([...REVIEW_MUST_REFUSE, ...ROUND2_MUST_REFUSE, ...ROUND3_MUST_REFUSE, ...ROUND4_MUST_REFUSE])("review leak, still refused with common first names on the board: %s", async (m) => {
    for (const text of [m, withContext(m, "Partners", PICKED)]) {
      const r = await guard(text, "message", common, ASK);
      expect(r.ok, text).toBe(false);
      if (!r.ok) expect(r.kind, text).not.toBe("ambiguous_partner");
    }
  }, T);

  it.each([...REVIEW_MUST_PASS, ...ROUND2_MUST_PASS, ...ROUND3_MUST_PASS, ...ROUND4_MUST_PASS, ...MUST_PASS])("review must-pass with common first names on the board: %s", async (m) => {
    expect(await guard(m, "message", common, ASK), m).toEqual({ ok: true, text: m });
    expect((await guard(withContext(m, "Partners", PICKED), "message", common, ASK)).ok, m).toBe(true);
  }, T);

  // CI on PR #154: plan_referral_meeting's result was withheld now and then. When anything in a
  // tool result is blanked (here a stranger), the redacted text is checked again, and that check
  // ran the business-only rules (", 9:00 am" read as a bare number) on code-built JSON. Those
  // rules are for her own words only.
  it("a tool result naming a partner by first name, with times, is kept after another name is blanked", async () => {
    const result = JSON.stringify(
      { queued: true, proposed: { with: "Maria", kind: "Meeting", when: "Tue Aug 19, 9:00 am" }, also_open: ["Tue Aug 19, 9:30 am", "Tue Aug 19, 10:00 am"], note: "Kevin Ortiz" },
      null,
      2,
    );
    const r = await guard(result, "tool_result", allow);
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) {
      expect(r.text).not.toContain("Kevin Ortiz");
    }
    // Her own message with the same shape is still judged by the business-only rules.
    expect((await guard("coffee with Maria, 9", "message", allow, ASK)).ok).toBe(false);
  }, T);

  // The CI flake's real cause: a random approval id whose hex digits read as a phone number.
  it("an approval id is never read as a phone number in a full-rules tool result", async () => {
    for (const id of ["66d21f71-d43f-48ad-af3c-e18592619355", "4269c074-2ed9-4818-a928-1727490bef4a", "193793dc-f688-40c7-9ecf-ac6564798793"]) {
      const text = JSON.stringify({ queued: true, approval_id: id, proposed: { with: "Birinder Malhi, MD", kind: "Meeting", when: "Tue Apr 15, 1:00 pm" } }, null, 2);
      const r = await guard(text, "tool_result", allow, { fullRules: true });
      expect(r, id).toEqual({ ok: true, text });
    }
    // A real phone number in the same place still refuses.
    const phone = JSON.stringify({ note: "her cell is 312-555-0199" });
    expect((await guard(phone, "tool_result", allow, { fullRules: true })).ok).toBe(false);
  }, T);

  it("every earlier adversarial must-refuse probe still refuses, with these partners on the board too", async () => {
    const board = { ...DEMO_ALLOWED, names: [...DEMO_ALLOWED.names, ...BOARD], directory: [...DEMO_ALLOWED.directory, ...BOARD] };
    const leaks: string[] = [];
    for (const c of ADVERSARIAL_REFUSE) {
      const r = await guard(c.text, c.at, board, ASK);
      if (r.ok || r.kind === "ambiguous_partner") leaks.push(c.text);
    }
    expect(leaks).toEqual([]);
  }, 900_000);
});
