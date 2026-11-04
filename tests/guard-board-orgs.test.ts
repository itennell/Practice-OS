// A care word inside a board organisation's own name ("Marrowpine Grief Center", "Hospice of
// the Lakes") is the office's name, not a diagnosis about a person. Code-built tool results put
// partner names and org names in one blob (the morning brief's JSON reads as one sentence),
// so org names are masked before the checks in tool results and replies (lib/aeon/guard.ts
// maskBoardOrgs). Her typed messages and memories are read as written. Real guard and real
// local name-finder; fictional cards only.
import { describe, expect, it } from "vitest";
import { loadEnv } from "../lib/env";

loadEnv();
const { guard, maskBoardOrgs } = await import("../lib/aeon/guard");

const PEOPLE = ["[Sample] Hollis Vance", "[Sample] Dr. Alex Example", "[Sample] Renata Ostrowski, RN"];
const ORGS = [
  "[Sample] Marrowpine Grief Center",
  "[Sample] Hospice of the Lakes",
  "[Sample] Northside Oncology Group",
  "[Sample] Cedar Lane Cancer Support",
  "Wrenfield Bereavement and Hospice Care",
];
const BOARD = [...PEOPLE, ...ORGS];
const allow = { names: ["Dana Reyes", "Reyes Counseling PLLC", ...BOARD], contacts: [], directory: BOARD, partners: PEOPLE };

// The morning brief's summary, as the MCP result carries it: inside JSON, so "\n" is two characters.
const brief = (extra = "") =>
  JSON.stringify({
    today: "2026-11-04",
    summary:
      "[Sample] Dana Reyes is a fictional demo practice.\nReferral follow-ups (6):\n" +
      "- [Sample] Hollis Vance (today, Wed, Nov 4)\n" +
      "- [Sample] Marrowpine Grief Center (in 2 days, Fri, Nov 6)\n" +
      "- [Sample] Hospice of the Lakes (in 3 days, Sat, Nov 7)\n" +
      "- [Sample] Northside Oncology Group (in 4 days, Sun, Nov 8)\n" +
      "- [Sample] Cedar Lane Cancer Support (in 5 days, Mon, Nov 9)\n" +
      "- Wrenfield Bereavement and Hospice Care (in 5 days, Mon, Nov 9)\n" +
      "- [Sample] Dr. Alex Example (in 6 days, Tue, Nov 10)\n" +
      extra +
      "Details and sources are on the Deadlines page.",
  });

const T = 240_000;

describe("board organisations with care words in their names", () => {
  it("masks board organisations only, never a person (even one listed without partners)", () => {
    expect(maskBoardOrgs("Call Marrowpine Grief Center and Hollis Vance", allow)).toBe("Call the office and Hollis Vance");
    expect(maskBoardOrgs("Carin Gordon has anxiety.", { names: ["Carin Gordon"], contacts: [], directory: ["Carin Gordon"] })).toBe("Carin Gordon has anxiety.");
    expect(maskBoardOrgs("Maria has cancer.", allow)).toBe("Maria has cancer.");
  });

  it("passes a brief that lists grief, hospice, oncology and cancer partners next to people", async () => {
    const r = await guard(brief(), "tool_result", allow, { fullRules: true });
    expect(r.ok).toBe(true);
    // Nothing is blanked: the orgs and the people on her board come through as written.
    if (r.ok) for (const o of ["Marrowpine Grief Center", "Hospice of the Lakes", "Northside Oncology Group", "Cedar Lane Cancer Support", "Hollis Vance", "Dr. Alex Example"]) expect(r.text).toContain(o);
  }, T);

  it("passes the same names in Aeon's reply", async () => {
    const r = await guard("This week: follow up with Hollis Vance and Marrowpine Grief Center, then Northside Oncology Group.", "reply", allow);
    expect(r.ok).toBe(true);
  }, T);

  it("still refuses a diagnosis about a person in a brief", async () => {
    const r = await guard(brief("Maria has cancer.\n"), "tool_result", allow, { fullRules: true });
    expect(r.ok).toBe(false);
    const named = await guard(brief("Hollis Vance has cancer.\n"), "tool_result", allow, { fullRules: true });
    expect(named.ok).toBe(false);
  }, T);

  it("reads her typed message as written: no masking there", async () => {
    expect(maskBoardOrgs("Maria from Marrowpine Grief Center", { ...allow, directory: [] })).toContain("Grief Center");
    const r = await guard("Maria is in grief after her loss", "message", allow);
    expect(r.ok).toBe(false);
  }, T);
});
