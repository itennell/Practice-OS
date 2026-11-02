// The private-pay planner: plain-code math on fixtures, and it asks instead of guessing.
import { describe, expect, it } from "vitest";
import { mainFeeCents, privatePayPlan, rampShare, SAMPLE_INPUT, WEEKS_PER_MONTH, type PlanInput } from "../lib/growth/plan";

const FEES = [
  { code: "90791", label: "First session (intake)", cents: 20000 },
  { code: "90834", label: "Therapy, 38-52 minutes", cents: 15000 },
  { code: "90837", label: "Therapy, 53 minutes or longer", cents: 17500 },
];

describe("private-pay planner", () => {
  it("uses her 90834 fee, not the intake fee", () => {
    expect(mainFeeCents(FEES)).toBe(15000);
    expect(mainFeeCents([{ code: "90791", label: "Intake", cents: 20000 }, { code: "90837", label: "Therapy", cents: 17500 }])).toBe(17500);
    expect(mainFeeCents([])).toBeNull();
  });

  it("works out the demo practice: 9 private-pay clients replace BCBSIL", () => {
    const p = privatePayPlan(SAMPLE_INPUT, FEES);
    const bcbs = p.panels.find((x) => x.payer === "BCBSIL")!;
    // 14 sessions x $92 = $1,288 a week; / $150 = 8.59 -> 9 clients
    expect(bcbs.clientsToReplace).toBe(9);
    expect(bcbs.monthlyCents).toBe(Math.round(14 * 9200 * WEEKS_PER_MONTH));
    // $92 over 70 minutes (60 + 10 admin) = $78.86 an hour; Aetna $105 -> $90
    expect(bcbs.hourlyCents).toBe(7886);
    expect(p.dropFirst?.payer).toBe("BCBSIL");
    expect(p.headline).toBe("You need 9 private-pay clients to replace BCBSIL. 12-week plan.");
    // Income: $12,000 - insurance ($1,918/wk) - 2 private ($300/wk), at $150 x 4.33 per client
    const insurance = Math.round(14 * 9200 * WEEKS_PER_MONTH) + Math.round(6 * 10500 * WEEKS_PER_MONTH);
    expect(p.insuranceMonthlyCents).toBe(insurance);
    expect(p.clientsForIncome).toBe(Math.ceil((1_200_000 - insurance - 2 * 15000 * WEEKS_PER_MONTH) / (15000 * WEEKS_PER_MONTH)));
    expect(p.goalClients).toBe(9);
    expect(p.openSlots).toBe(3);
    expect(p.notes.join(" ")).toMatch(/3 open slots/);
    expect(p.asks).toEqual([]);
  });

  it("builds a 12-week plan that reaches the goal, with consults at 50% conversion", () => {
    const p = privatePayPlan(SAMPLE_INPUT, FEES);
    expect(p.weeks).toHaveLength(12);
    expect(p.weeks[0].newClients + p.weeks[1].newClients).toBe(0); // setup weeks
    expect(p.weeks.reduce((n, w) => n + w.newClients, 0)).toBe(9);
    expect(p.weeks[11].totalPrivateClients).toBe(2 + 9);
    for (const w of p.weeks) expect(w.consults).toBe(Math.ceil(w.newClients / 0.5));
    expect(p.checkpoints.map((c) => c.week)).toEqual([2, 4, 8, 12]);
    expect(p.checkpoints[3].check).toMatch(/contract for how much notice/);
    expect(rampShare(12)).toBe(1);
  });

  it("asks for an unknown payer rate and never invents one", () => {
    const input: PlanInput = { ...SAMPLE_INPUT, panels: [{ payer: "BCBSIL", weekly_sessions: 14, rate_cents: null }, { payer: "Aetna", weekly_sessions: 6, rate_cents: 10500 }] };
    const p = privatePayPlan(input, FEES);
    const bcbs = p.panels.find((x) => x.payer === "BCBSIL")!;
    expect(bcbs.rateCents).toBeNull();
    expect(bcbs.clientsToReplace).toBeNull();
    expect(bcbs.monthlyCents).toBeNull();
    expect(p.asks.some((a) => /What does BCBSIL pay you/.test(a))).toBe(true);
    // It can still rank what it knows, and says the ranking may change.
    expect(p.dropFirst?.payer).toBe("Aetna");
    expect(p.notes.join(" ")).toMatch(/may change/);
    expect(p.insuranceMonthlyCents).toBeNull();
    expect(p.clientsForIncome).toBeNull();
  });

  it("asks for sessions, targets and her fee when she hasn't given them", () => {
    const p = privatePayPlan({ panels: [{ payer: "Aetna", weekly_sessions: null, rate_cents: null }], target_weekly_sessions: null, target_monthly_income_cents: null }, []);
    expect(p.asks).toEqual([
      "What do you charge a private-pay client for one therapy session?",
      "How many Aetna sessions do you see in a typical week?",
      "What does Aetna pay you for one session? (Your contract or an EOB shows it.)",
      "How much do you want the practice to bring in each month, before taxes?",
      "How many sessions a week do you want to see when you're full?",
    ]);
    expect(p.goalClients).toBeNull();
    expect(p.weeks).toEqual([]);
    expect(p.headline).toMatch(/needs a few numbers/);
  });

  it("ranks by pay for her time: admin-heavy panels drop first even at a similar rate", () => {
    const p = privatePayPlan(
      { panels: [{ payer: "Medicaid MCO", weekly_sessions: 5, rate_cents: 9000, kind: "mco" }, { payer: "Commercial", weekly_sessions: 5, rate_cents: 8800, kind: "commercial" }], target_weekly_sessions: 25, target_monthly_income_cents: 0 },
      FEES,
    );
    // 9000*60/80 = 6750 vs 8800*60/70 = 7543
    expect(p.dropFirst?.payer).toBe("Medicaid MCO");
    expect(p.clientsForIncome).toBe(0);
  });
});
