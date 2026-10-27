// Compliance calendar: date math, rule checks and the calendar for the demo
// practice. Expected values come from the agencies' own published dates
// (IRS Form 1040-ES and Pub 509 for 2026, IL-1040-ES 2026, IDFPR's license
// chart), not from our own arithmetic.
import { describe, expect, it } from "vitest";
import { addBusinessDays, addMonths, isBusinessDay, legalHolidays, rollForward, ymd } from "../lib/compliance/dates";
import { danaFacts } from "../lib/compliance/demo";
import { SHIPPED_RULES } from "../lib/compliance/rules";
import { buildCalendar, dueWithin, nextDue, rulesFor, urgency } from "../lib/compliance/schedule";
import type { Facts, Rule } from "../lib/compliance/types";
import { checkRule, checkRules, isOfficialUrl } from "../lib/compliance/validate";

const TODAY = "2026-10-26";
const rule = (id: string): Rule => {
  const r = SHIPPED_RULES.find((x) => x.id === id);
  if (!r) throw new Error(`no rule ${id}`);
  return r;
};
const facts = (over: Partial<Facts> = {}): Facts => ({ ...danaFacts(TODAY), ...over });
const dates = (id: string, today = TODAY, f = facts()) => {
  const next = nextDue(rule(id), f, today);
  if (!Array.isArray(next)) throw new Error(`needs ${next.needs}`);
  return next.map((n) => n.due_on).sort();
};

describe("date math", () => {
  it("rolls weekend and legal-holiday due dates to the next business day (IRC 7503)", () => {
    expect(rollForward("2026-10-31")).toBe("2026-11-02"); // Sat: Q3 Form 941, Pub 509
    expect(rollForward("2026-01-31")).toBe("2026-02-02"); // Sat: W-2s, Pub 509
    expect(rollForward("2026-03-15")).toBe("2026-03-16"); // Sun: Form 1065, Pub 509
    expect(rollForward("2028-01-15")).toBe("2028-01-18"); // Sat, then MLK Day Monday
  });

  it("knows DC Emancipation Day moves April 15 (2022 and 2023 filing seasons)", () => {
    expect(rollForward("2022-04-15")).toBe("2022-04-18"); // Apr 16 Sat observed Fri Apr 15
    expect(rollForward("2023-04-15")).toBe("2023-04-18"); // Sat, then Apr 16 Sun observed Mon Apr 17
    expect(rollForward("2026-04-15")).toBe("2026-04-15");
  });

  it("observes fixed holidays on the nearest weekday", () => {
    expect(legalHolidays(2026).has("2026-07-03")).toBe(true); // Jul 4 2026 is a Saturday
    expect(legalHolidays(2021).has("2021-12-31")).toBe(true); // Jan 1 2022 is a Saturday
    expect(isBusinessDay("2026-11-26")).toBe(false); // Thanksgiving
  });

  it("counts business days and clamps months", () => {
    expect(addBusinessDays("2026-11-25", 3)).toBe("2026-12-01"); // skips Thanksgiving and the weekend
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(ymd(2027, 2, 28)).toBe("2027-02-28");
  });
});

describe("published dates", () => {
  it("federal estimated tax matches the 2026 Form 1040-ES", () => {
    expect(dates("us_estimated_tax", "2026-01-01")).toEqual(["2026-01-15", "2026-04-15", "2026-06-15", "2026-09-15"]);
    expect(dates("us_estimated_tax")).toEqual(["2027-01-15", "2027-04-15", "2027-06-15", "2027-09-15"]);
  });

  it("Illinois estimated tax matches the 2026 IL-1040-ES", () => {
    expect(dates("il_estimated_tax", "2026-01-01")).toEqual(["2026-01-15", "2026-04-15", "2026-06-15", "2026-09-15"]);
  });

  it("Form 941 matches Pub 509 (2026), labeled by quarter", () => {
    const employer = facts({ employee_count: 1 });
    const next = nextDue(rule("us_941"), employer, "2026-01-01");
    expect(Array.isArray(next) && next.map((n) => [n.due_on, n.title]).sort()).toEqual([
      ["2026-02-02", "Q4 2025 payroll return (Form 941)"],
      ["2026-04-30", "Q1 2026 payroll return (Form 941)"],
      ["2026-07-31", "Q2 2026 payroll return (Form 941)"],
      ["2026-11-02", "Q3 2026 payroll return (Form 941)"],
    ]);
  });

  it("partnership returns: federal 1065 in March, Illinois IL-1065 in April", () => {
    const partnership = facts({ entity_tax: "partnership" });
    expect(dates("us_return_partnership", "2026-01-01", partnership)).toEqual(["2026-03-16"]);
    expect(dates("il_return_partnership", "2026-01-01", partnership)).toEqual(["2026-04-15"]);
  });

  it("license expirations match IDFPR's license chart", () => {
    expect(dates("il_lcpc_renewal")).toEqual(["2027-03-31"]);
    expect(dates("il_lcsw_renewal", TODAY, facts({ credential: "LCSW" }))).toEqual(["2027-11-30"]);
    expect(dates("il_lmft_renewal", TODAY, facts({ credential: "LMFT" }))).toEqual(["2027-02-28"]);
    expect(dates("il_psychologist_renewal", TODAY, facts({ credential: "Psychologist" }))).toEqual(["2028-09-30"]);
  });

  it("renewal windows open on IDFPR's chart dates", () => {
    expect(dates("il_lcpc_window")).toEqual(["2027-01-01"]);
    expect(dates("il_lcsw_window")).toEqual(["2027-09-01"]);
    expect(dates("il_lmft_window")).toEqual(["2026-12-01"]);
    expect(dates("il_psychologist_window")).toEqual(["2028-07-01"]);
  });

  it("PLLC registration expires Jan 1 every third year from 2019 (805 ILCS 185/15(e))", () => {
    expect(dates("il_pllc_registration")).toEqual(["2028-01-01"]);
    expect(dates("il_pllc_registration", "2028-01-02")).toEqual(["2031-01-01"]);
  });

  it("HIPAA small-breach report is 60 days after the year ends", () => {
    const covered = facts({ bills_insurance_electronically: true });
    expect(dates("us_hipaa_breach_log", TODAY, covered)).toEqual(["2027-03-01"]);
    expect(dates("us_hipaa_breach_log", "2028-01-05", covered)).toEqual(["2028-02-29"]); // leap year
  });
});

describe("rules from practice facts", () => {
  it("CAQH: 180 days in Illinois replaces the national 120", () => {
    const il = rulesFor(SHIPPED_RULES, facts()).map((r) => r.id);
    expect(il).toContain("il_caqh_reattestation");
    expect(il).not.toContain("us_caqh_reattestation");
    expect(dates("il_caqh_reattestation", TODAY, facts({ caqh_last_attested_on: "2026-06-01" }))).toEqual(["2026-11-28"]);

    const ca = rulesFor(SHIPPED_RULES, facts({ practice_state: "CA", city: null })).map((r) => r.id);
    expect(ca).toContain("us_caqh_reattestation");
    expect(ca.some((id) => id.startsWith("il_"))).toBe(false);
  });

  it("PLLC formed in December: annual report due before Dec 1", () => {
    expect(dates("il_pllc_annual_report")).toEqual(["2026-11-30"]);
    expect(dates("il_pllc_annual_report", "2026-12-01")).toEqual(["2027-11-30"]);
    // Formed this year: the first report is next year.
    expect(dates("il_pllc_annual_report", TODAY, facts({ pllc_formed_on: "2026-03-02" }))).toEqual(["2027-02-28"]);
  });

  it("employer rules stay off with no employees and switch on with one", () => {
    const solo = rulesFor(SHIPPED_RULES, facts()).map((r) => r.id);
    for (const id of ["us_941", "us_i9", "il_new_hire_report", "il_workers_comp"]) expect(solo).not.toContain(id);
    const hired = rulesFor(SHIPPED_RULES, facts({ employee_count: 1 })).map((r) => r.id);
    for (const id of ["us_941", "us_i9", "il_new_hire_report", "il_workers_comp"]) expect(hired).toContain(id);
  });

  it("Chicago replaces the state paid leave and harassment training rules", () => {
    const chicago = rulesFor(SHIPPED_RULES, facts({ employee_count: 2 })).map((r) => r.id);
    expect(chicago).toContain("il_chi_paid_leave");
    expect(chicago).not.toContain("il_paid_leave");
    const springfield = rulesFor(SHIPPED_RULES, facts({ employee_count: 2, city: null })).map((r) => r.id);
    expect(springfield).toContain("il_paid_leave");
    expect(springfield).not.toContain("il_chi_paid_leave");
  });

  it("FOID report applies to psychologists and qualified examiners only", () => {
    const has = (f: Facts) => rulesFor(SHIPPED_RULES, f).some((r) => r.id === "il_foid_report");
    expect(has(facts())).toBe(false);
    expect(has(facts({ qualified_examiner: true }))).toBe(true);
    expect(has(facts({ credential: "Psychologist" }))).toBe(true);
  });

  it("first renewal: no CE rule, a note instead", () => {
    const ids = rulesFor(SHIPPED_RULES, facts({ first_renewal: true })).map((r) => r.id);
    expect(ids).not.toContain("il_lcpc_ce");
    expect(ids).toContain("il_ce_first_renewal");
  });

  it("CE topics: dementia only for clients 26+, LMFT trainings marked optional", () => {
    const left = (f: Facts, id: string) => buildCalendar(SHIPPED_RULES, f, TODAY).due.find((d) => d.rule_id === id)?.ce?.topics_left ?? [];
    expect(left(facts(), "il_lcpc_ce").map((t) => t.id)).toContain("dementia");
    expect(left(facts({ sees_adults_26_plus: false }), "il_lcpc_ce").map((t) => t.id)).not.toContain("dementia");
    const lmft = left(facts({ credential: "LMFT" }), "il_lmft_ce");
    expect(lmft.find((t) => t.id === "implicit_bias")?.optional).toMatch(/Optional/);
    expect(lmft.find((t) => t.id === "sexual_harassment")?.optional).toBeNull();
  });

  it("a missing date becomes a question, not a fake deadline", () => {
    const cal = buildCalendar(SHIPPED_RULES, facts({ caqh_last_attested_on: null }), TODAY);
    expect(cal.needs_facts).toContainEqual(expect.objectContaining({ rule_id: "il_caqh_reattestation", fact: "caqh_last_attested_on" }));
    expect(cal.due.some((d) => d.rule_id === "il_caqh_reattestation")).toBe(false);
  });
});

describe("urgency", () => {
  const lead = { red: 14, yellow: 45 };
  it("red under 14 days, yellow under 45, green after", () => {
    expect(urgency("2026-11-08", TODAY, lead)).toBe("red"); // 13 days
    expect(urgency("2026-11-09", TODAY, lead)).toBe("yellow"); // 14
    expect(urgency("2026-12-09", TODAY, lead)).toBe("yellow"); // 44
    expect(urgency("2026-12-10", TODAY, lead)).toBe("green"); // 45
    expect(urgency("2026-10-25", TODAY, lead)).toBe("overdue");
  });
});

describe("Dana's 90 days (the demo)", () => {
  const cal = buildCalendar(SHIPPED_RULES, danaFacts(TODAY), TODAY);
  const soon = dueWithin(cal, 90);
  const find = (id: string) => soon.find((d) => d.rule_id === id);

  it("shows CAQH red, the PLLC report yellow and taxes green", () => {
    expect(find("il_caqh_reattestation")).toMatchObject({ due_on: "2026-11-04", days_left: 9, urgency: "red" });
    expect(find("il_pllc_annual_report")).toMatchObject({ due_on: "2026-11-30", urgency: "yellow" });
    expect(find("us_estimated_tax")).toMatchObject({ due_on: "2027-01-15", title: "Q4 2026 federal estimated tax", urgency: "green" });
    expect(find("il_lcpc_window")).toMatchObject({ due_on: "2027-01-01" });
  });

  it("is sorted by due date and leaves out what doesn't apply", () => {
    expect(soon.map((d) => d.due_on)).toEqual([...soon.map((d) => d.due_on)].sort());
    expect(soon.some((d) => d.rule.category === "payroll" || d.rule.category === "hipaa")).toBe(false);
  });

  it("asks the right setup questions for a solo practice that texts", () => {
    const ids = cal.setups.map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["us_a2p_10dlc", "us_malpractice", "us_professional_will", "us_retirement_plan", "il_ce_certificates"]));
    expect(ids).not.toContain("il_workers_comp");
  });
});

describe("rule checks", () => {
  it("every shipped rule passes", () => {
    const { problems } = checkRules(SHIPPED_RULES, TODAY);
    expect(problems).toEqual([]);
  });

  it("accepts .gov, boards and listed hosts; rejects the rest", () => {
    expect(isOfficialUrl("https://www.ilga.gov/x")).toBe(true);
    expect(isOfficialUrl("https://bbs.ca.gov/x")).toBe(true);
    expect(isOfficialUrl("https://www.caqh.org/x")).toBe(true);
    expect(isOfficialUrl("https://some-blog.com/caqh-tips")).toBe(false);
    expect(isOfficialUrl("https://caqh.org.evil.com/x")).toBe(false);
  });

  const agentRule = {
    ...rule("il_lcpc_renewal"),
    id: "ca_lcsw_renewal",
    jurisdiction: "CA",
    verified_by: "agent",
    source: { citation: "CA BBS", url: "https://www.bbs.ca.gov/licensees/renewal.html", quote: "expires at midnight on the last day of the birth month", checked_on: TODAY },
  };

  it("accepts a well-sourced agent rule", () => {
    expect(checkRule(agentRule, TODAY).ok).toBe(true);
  });

  it("rejects an agent rule with no quote, a blog source, a stale check or an impossible date", () => {
    const bad = (patch: object) => checkRule({ ...agentRule, ...patch }, TODAY);
    expect(bad({ source: { ...agentRule.source, quote: undefined } }).ok).toBe(false);
    expect(bad({ source: { ...agentRule.source, url: "https://therapist-blog.com/renew" } }).ok).toBe(false);
    expect(bad({ source: { ...agentRule.source, checked_on: "2025-01-01" } }).ok).toBe(false);
    expect(bad({ schedule: { type: "every_n_years", month: 2, day: 30, anchor_year: 2025, n: 2 } }).ok).toBe(false);
    expect(bad({ kind: "clock" }).ok).toBe(false); // a clock rule needs a clock schedule
  });
});
