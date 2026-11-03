// The Referrals calendar's slot finder (lib/referrals/meetings.ts openSlots): plain code, no
// database. Every date is explicit (never "now" plus an interval), so the DST weeks below stay
// the DST weeks whenever the suite runs.
import { describe, expect, it } from "vitest";
import { addDays, checkRange, daysRange, DEFAULT_WORK_HOURS, meetingLabel, openSlots, type WorkHours } from "../lib/referrals/meetings";
import { MEETING_TOOLS } from "../lib/aeon/tools-meetings";
import { REFERRAL_DEMO_APPROVAL_KINDS, REFERRAL_DEMO_TOOLS } from "../lib/features";
import { APPROVAL_KINDS } from "../lib/approval-kinds";
import { KIND_POLICY, shouldAutoRun } from "../lib/approval-policy";
import { executors } from "../lib/executors";

const CHI = "America/Chicago";
const iso = (d: Date) => d.toISOString();

describe("openSlots: her hours in her time zone", () => {
  it("offers 9 to 5 on weekdays only, on the half hour, ending by 5", () => {
    // Mon 2026-11-09 through Sun 2026-11-15, Chicago (CST, UTC-6).
    const slots = openSlots(daysRange("2026-11-09", "2026-11-15", CHI), 45, DEFAULT_WORK_HOURS, CHI, [], 500);
    expect(iso(slots[0].start)).toBe("2026-11-09T15:00:00.000Z"); // 9:00 am CST
    const days = new Set(slots.map((s) => meetingLabel(s.start, CHI).split(",")[0]));
    expect([...days]).toEqual(["Mon Nov 9", "Tue Nov 10", "Wed Nov 11", "Thu Nov 12", "Fri Nov 13"]);
    // 9:00 .. 4:00 every half hour: a 45-minute coffee at 4:30 would end after 5.
    expect(slots.filter((s) => meetingLabel(s.start, CHI).startsWith("Mon")).length).toBe(15);
    const last = slots.filter((s) => meetingLabel(s.start, CHI).startsWith("Fri")).at(-1)!;
    expect(meetingLabel(last.start, CHI)).toBe("Fri Nov 13, 4:00 pm");
    expect(iso(last.end)).toBe("2026-11-13T22:45:00.000Z");
  });

  it("keeps 9 am at 9 am across the fall-back weekend (Nov 1, 2026)", () => {
    const slots = openSlots(daysRange("2026-10-30", "2026-11-02", CHI), 30, DEFAULT_WORK_HOURS, CHI, [], 500);
    const firstOf = (label: string) => slots.find((s) => meetingLabel(s.start, CHI).startsWith(label))!;
    expect(iso(firstOf("Fri Oct 30").start)).toBe("2026-10-30T14:00:00.000Z"); // CDT, UTC-5
    expect(iso(firstOf("Mon Nov 2").start)).toBe("2026-11-02T15:00:00.000Z"); // CST, UTC-6
    expect(meetingLabel(firstOf("Mon Nov 2").start, CHI)).toBe("Mon Nov 2, 9:00 am");
  });

  it("keeps 9 am at 9 am across the spring-forward weekend (Mar 8, 2026)", () => {
    const slots = openSlots(daysRange("2026-03-06", "2026-03-09", CHI), 60, DEFAULT_WORK_HOURS, CHI, [], 500);
    const firsts = slots.filter((s) => meetingLabel(s.start, CHI).endsWith("9:00 am")).map((s) => iso(s.start));
    expect(firsts).toEqual(["2026-03-06T15:00:00.000Z", "2026-03-09T14:00:00.000Z"]);
    // Every slot is exactly an hour of wall clock and of real time.
    for (const s of slots) expect(s.end.getTime() - s.start.getTime()).toBe(3_600_000);
  });

  it("works in another zone: Los Angeles and Honolulu (no DST)", () => {
    const la = openSlots(daysRange("2026-11-02", "2026-11-02", "America/Los_Angeles"), 30, DEFAULT_WORK_HOURS, "America/Los_Angeles");
    expect(iso(la[0].start)).toBe("2026-11-02T17:00:00.000Z");
    const hi = openSlots(daysRange("2026-03-09", "2026-03-09", "Pacific/Honolulu"), 30, DEFAULT_WORK_HOURS, "Pacific/Honolulu");
    expect(iso(hi[0].start)).toBe("2026-03-09T19:00:00.000Z");
  });

  it("uses her open days, skips her closed dates and anything already planned", () => {
    const hours: WorkHours = { weekdays: [2, 4], startHour: 9, endHour: 17, closedOn: ["2026-11-12"] };
    const busy = [{ start: new Date("2026-11-10T15:00:00Z"), end: new Date("2026-11-10T16:00:00Z") }]; // Tue 9 to 10 am
    const slots = openSlots(daysRange("2026-11-09", "2026-11-15", CHI), 30, hours, CHI, busy, 500);
    const labels = slots.map((s) => meetingLabel(s.start, CHI));
    expect(new Set(labels.map((l) => l.split(",")[0]))).toEqual(new Set(["Tue Nov 10"])); // Thu Nov 12 is closed
    expect(labels[0]).toBe("Tue Nov 10, 10:00 am");
  });

  it("starts no sooner than the range and stops at its end and its limit", () => {
    const from = new Date("2026-11-10T19:15:00Z"); // Tue 1:15 pm CST
    const slots = openSlots({ from, to: new Date("2026-11-10T21:00:00Z") }, 30, DEFAULT_WORK_HOURS, CHI);
    expect(slots.map((s) => meetingLabel(s.start, CHI))).toEqual(["Tue Nov 10, 1:30 pm", "Tue Nov 10, 2:00 pm", "Tue Nov 10, 2:30 pm"]);
    expect(openSlots(daysRange("2026-11-09", "2026-11-13", CHI), 30, DEFAULT_WORK_HOURS, CHI, [], 4)).toHaveLength(4);
  });

  it("crosses a month end and refuses bad ranges and lengths", () => {
    const slots = openSlots(daysRange("2026-11-30", "2026-12-01", CHI), 30, DEFAULT_WORK_HOURS, CHI, [], 500);
    expect(new Set(slots.map((s) => meetingLabel(s.start, CHI).split(",")[0]))).toEqual(new Set(["Mon Nov 30", "Tue Dec 1"]));
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(() => checkRange({ from: new Date("2026-11-10T00:00:00Z"), to: new Date("2026-11-09T00:00:00Z") })).toThrow(/after its start/);
    expect(() => checkRange(daysRange("2026-01-01", "2026-06-01", CHI))).toThrow(/62 days/);
    expect(() => openSlots(daysRange("2026-11-09", "2026-11-09", CHI), 600, DEFAULT_WORK_HOURS, CHI)).toThrow(/5 minutes to 8 hours/);
  });
});

describe("the referral_meeting kind and tools are wired in", () => {
  it("is a known approval kind with an executor, waits in Manual and Auto, and shows in the referrals demo", () => {
    expect(APPROVAL_KINDS).toContain("referral_meeting");
    expect(executors.referral_meeting).toBeTypeOf("function");
    expect(KIND_POLICY.referral_meeting).toEqual({ helper: "referrals", tier: "sensitive" });
    expect(shouldAutoRun("referral_meeting", { mode: "manual" })).toBe(false);
    expect(shouldAutoRun("referral_meeting", { mode: "auto" })).toBe(false);
    expect(REFERRAL_DEMO_APPROVAL_KINDS).toContain("referral_meeting");
    expect(REFERRAL_DEMO_TOOLS).toEqual(expect.arrayContaining(["plan_referral_meeting", "list_referral_meetings"]));
  });

  it("plan_referral_meeting only queues (no data change of its own); list is read-only", () => {
    const plan = MEETING_TOOLS.find((t) => t.name === "plan_referral_meeting")!;
    const list = MEETING_TOOLS.find((t) => t.name === "list_referral_meetings")!;
    expect(plan.changesData).toBe(false);
    expect(plan.description).toMatch(/approv/);
    expect(list.annotations.readOnlyHint).toBe(true);
  });
});
