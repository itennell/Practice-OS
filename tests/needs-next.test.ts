import { describe, expect, it } from "vitest";
import { needsNext, type NeedsInput } from "../lib/admin/needs-next";
import type { MorningBrief } from "../lib/compliance/brief";
import { DANA_PROFILE } from "../lib/credentialing/demo";
import type { EstimateRow } from "../lib/gfe/store";
import type { SuperbillRow } from "../lib/superbill/store";

const TODAY = "2026-10-28";

const emptyBrief = (over: Partial<MorningBrief> = {}): MorningBrief => ({
  today: TODAY,
  this_week: [],
  urgent_soon: [],
  setup_questions: [],
  needs_dates: [],
  payer_dates: [],
  is_sample: true,
  summary: "",
  ...over,
});

const deadline = (title: string, days_left: number, rule_id = title.toLowerCase().replace(/\W+/g, "_")) => ({
  rule_id,
  title,
  due_on: `2026-11-${String(Math.max(1, days_left)).padStart(2, "0")}`,
  days_left,
  urgency: "red",
  what_to_do: null,
  you_must: "Log in and attest",
  source: null,
  needs_confirming: false,
});

const estimate = (over: Partial<EstimateRow>): EstimateRow =>
  ({ id: "e1", reference: "GFE-2026-0002", issued_on: null, approval_status: "pending", due_on: "2026-10-29", ...over }) as EstimateRow;

const superbill = (over: Partial<SuperbillRow>): SuperbillRow =>
  ({ id: "s1", reference: "SB-2026-0001", issued_on: null, lines: [{}, {}, {}, {}], ...over }) as SuperbillRow;

const input = (over: Partial<NeedsInput>): NeedsInput => ({ today: TODAY, brief: emptyBrief(), estimates: [], superbills: [], profile: DANA_PROFILE, ...over });

describe("what your practice needs next", () => {
  it("is empty for a practice with nothing waiting", () => {
    expect(needsNext(input({}))).toEqual([]);
  });

  it("puts overdue first, then the next 3 days (a GFE owed tomorrow), then this week", () => {
    const items = needsNext(
      input({
        brief: emptyBrief({ this_week: [deadline("Quarterly taxes", 6), deadline("CAQH re-attestation", -2, "il_caqh_reattest")] }),
        estimates: [estimate({ due_on: "2026-10-29" })],
      }),
    );
    expect(items.map((i) => i.title)).toEqual(["CAQH re-attestation", "Good Faith Estimate GFE-2026-0002", "Quarterly taxes"]);
    expect(items[0]).toMatchObject({ tier: 1, why: expect.stringContaining("2 days overdue"), action: { label: "Get me ready", ask: "Get me ready for CAQH" } });
    expect(items[1]).toMatchObject({ tier: 2, action: { href: "/approvals" } });
  });

  it("flags a missing tax ID as blocking paperwork, with a button to the credentialing form", () => {
    const items = needsNext(input({ profile: { ...DANA_PROFILE, tin: null } }));
    expect(items).toEqual([
      expect.objectContaining({ title: "Add your tax ID", tier: 3, action: { label: "Add it", panel: "credentialing" } }),
    ]);
  });

  it("lists superbills not yet given, and skips given ones and issued or declined estimates", () => {
    const items = needsNext(
      input({
        superbills: [superbill({}), superbill({ id: "s2", reference: "SB-2026-0002", issued_on: "2026-10-20" })],
        estimates: [estimate({ issued_on: "2026-10-20", approval_status: "done" }), estimate({ id: "e3", approval_status: "rejected" })],
      }),
    );
    expect(items.map((i) => i.title)).toEqual(["Superbill SB-2026-0001"]);
    expect(items[0].why).toBe("4 sessions · ready to give to the client");
  });

  it("keeps setup questions and missing dates last, and the order stable", () => {
    const brief = emptyBrief({
      setup_questions: [{ rule_id: "us_retirement_plan", title: "Retirement plan", what_to_do: null }],
      needs_dates: [{ title: "CAQH last attested", question: "When did you last attest on CAQH?" }],
      payer_dates: [{ id: "p1", payer: "BCBSIL", kind: "follow_up", due_on: "2026-11-20", days_left: 23, what: "" }],
    });
    const items = needsNext(input({ brief }));
    expect(items.map((i) => i.kind)).toEqual(["insurance", "date_needed", "setup"]);
    expect(needsNext(input({ brief }))).toEqual(items);
  });
});
