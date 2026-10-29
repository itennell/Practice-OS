import { describe, expect, it } from "vitest";
import { summarize } from "../lib/compliance/brief";

const empty = { today: "2026-10-29", this_week: [], urgent_soon: [], setup_questions: [], needs_dates: [], payer_dates: [], is_sample: false };
const followUp = { id: "APP-1042", payer: "BCBSIL", kind: "follow_up" as const, due_on: "2026-11-04", days_left: 6, what: "BCBSIL application follow-up" };

describe("morning brief summary", () => {
  it("says nothing is due only when there is truly nothing this week", () => {
    expect(summarize(empty)).toContain("Nothing is due in the next 7 days.");
  });

  it("never says nothing is due above an insurance follow-up in the same week", () => {
    const text = summarize({ ...empty, payer_dates: [followUp] });
    expect(text).not.toMatch(/nothing is due/i);
    expect(text).toContain("Insurance dates (1):");
    expect(text).toContain("BCBSIL application follow-up (in 6 days");
  });
});
