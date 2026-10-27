import { addDays, daysBetween, federalHolidays, toDate, year, type ISODate } from "../compliance/dates";

// When a Good Faith Estimate is due, under 45 CFR 149.610(b)(1)(vi). The rule
// counts business days but doesn't define them; Practice-OS reads a business
// day as a day the practice is open.

export type OpenDays = {
  /** Weekdays the practice is open, 0 = Sunday. */
  weekdays: number[];
  /** Extra closure dates (vacation, office closed). */
  closedOn: ISODate[];
  /** Closed on federal holidays (5 USC 6103). */
  closeFederalHolidays: boolean;
};

/** Used when the practice hasn't set its hours: Monday to Friday, closed federal holidays. */
export const WEEKDAYS: OpenDays = { weekdays: [1, 2, 3, 4, 5], closedOn: [], closeFederalHolidays: true };

export function isOpen(date: ISODate, open: OpenDays): boolean {
  if (!open.weekdays.includes(toDate(date).getUTCDay())) return false;
  if (open.closedOn.includes(date)) return false;
  return !(open.closeFederalHolidays && federalHolidays(year(date)).has(date));
}

/** n open days after date (date itself not counted). */
export function addOpenDays(date: ISODate, n: number, open: OpenDays): ISODate {
  if (open.weekdays.length === 0) throw new Error("The practice has no open weekdays");
  let d = date;
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isOpen(d, open)) left--;
  }
  return d;
}

/** Open days after `from`, up to and including `to`. */
export function openDaysBetween(from: ISODate, to: ISODate, open: OpenDays): number {
  let count = 0;
  for (let i = 1; i <= daysBetween(from, to); i++) if (isOpen(addDays(from, i), open)) count++;
  return count;
}

export type GfeTrigger =
  | { kind: "scheduled"; scheduledOn: ISODate; serviceOn: ISODate }
  | { kind: "requested"; requestedOn: ISODate };

export type GfeDue = {
  /** Null when booked fewer than 3 open days out: no deadline at booking. */
  dueOn: ISODate | null;
  /** Open days between booking and the visit (scheduled only). */
  leadDays: number | null;
  rule: string;
  explain: string;
};

export function gfeDueDate(t: GfeTrigger, open: OpenDays = WEEKDAYS): GfeDue {
  if (t.kind === "requested") {
    return {
      dueOn: addOpenDays(t.requestedOn, 3, open),
      leadDays: null,
      rule: "45 CFR 149.610(b)(1)(vi)(C)",
      explain: "Requested by the client: give it within 3 business days.",
    };
  }
  if (t.serviceOn < t.scheduledOn) throw new Error("The visit is before the booking date");
  const lead = openDaysBetween(t.scheduledOn, t.serviceOn, open);
  // A visit 10+ days out also meets "at least 3"; (B) is the specific allowance.
  if (lead >= 10) {
    return {
      dueOn: addOpenDays(t.scheduledOn, 3, open),
      leadDays: lead,
      rule: "45 CFR 149.610(b)(1)(vi)(B)",
      explain: "Booked at least 10 business days ahead: give it within 3 business days.",
    };
  }
  if (lead >= 3) {
    return {
      dueOn: addOpenDays(t.scheduledOn, 1, open),
      leadDays: lead,
      rule: "45 CFR 149.610(b)(1)(vi)(A)",
      explain: "Booked at least 3 business days ahead: give it within 1 business day.",
    };
  }
  return {
    dueOn: null,
    leadDays: lead,
    rule: "45 CFR 149.610(b)(1)(vi)",
    explain: "Booked fewer than 3 business days ahead: no deadline at booking. If the client asks, it's due in 3 business days.",
  };
}
