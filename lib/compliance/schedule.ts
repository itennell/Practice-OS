import { addDays, addMonths, daysBetween, rollForward, year, ymd, type ISODate } from "./dates";
import type { Facts, Rule } from "./types";

// Turns rules plus a practice's facts into the calendar: dated items (with
// urgency), event clocks waiting for an event, setup reminders, notes, and the
// facts we still need to ask for. Pure: no database, no clock (pass today in).

export type Urgency = "overdue" | "red" | "yellow" | "green";

export type CeProgress = {
  required: number;
  done: number;
  topics_left: { id: string; label: string; hours: number; optional: string | null }[];
};

export type DueItem = {
  rule_id: string;
  title: string;
  due_on: ISODate;
  days_left: number;
  urgency: Urgency;
  rule: Rule;
  ce?: CeProgress;
};

export type Calendar = {
  due: DueItem[];
  clocks: Rule[];
  setups: Rule[];
  notes: Rule[];
  /** A rule applies but needs a date from her first (e.g. her last CAQH attestation). */
  needs_facts: { rule_id: string; title: string; fact: string }[];
};

function matches(value: unknown, want: unknown): boolean {
  const options = Array.isArray(want) ? want : [want];
  // A date fact listed as `true` means "is set".
  return options.some((o) => (o === true && typeof value === "string" ? true : value === o));
}

function jurisdictionApplies(j: string, facts: Facts): boolean {
  if (j === "US") return true;
  const [state, city] = j.split("-");
  if (state !== facts.practice_state) return false;
  return city === undefined || city === facts.city;
}

export function applies(rule: Rule, facts: Facts): boolean {
  if (!jurisdictionApplies(rule.jurisdiction, facts)) return false;
  const a = rule.applies_to;
  if (a.credentials && !a.credentials.includes(facts.credential)) return false;
  if (a.min_employees && facts.employee_count < a.min_employees) return false;
  const f = facts as Record<string, unknown>;
  if (a.facts && !Object.entries(a.facts).every(([k, v]) => matches(f[k], v))) return false;
  if (a.any_facts && !Object.entries(a.any_facts).some(([k, v]) => matches(f[k], v))) return false;
  return true;
}

/** The rules that apply to this practice, after narrower rules replace broader ones. */
export function rulesFor(rules: Rule[], facts: Facts): Rule[] {
  const live = rules.filter((r) => applies(r, facts));
  const replaced = new Set(live.flatMap((r) => (r.replaces ? [r.replaces] : [])));
  return live.filter((r) => !replaced.has(r.id));
}

export function urgency(dueOn: ISODate, today: ISODate, lead: { red: number; yellow: number }): Urgency {
  const left = daysBetween(today, dueOn);
  if (left < 0) return "overdue";
  if (left < lead.red) return "red";
  if (left < lead.yellow) return "yellow";
  return "green";
}

function label(template: string, due: ISODate): string {
  const y = year(due);
  return template.replaceAll("{Y-1}", String(y - 1)).replaceAll("{Y}", String(y));
}

type Dated = { due_on: ISODate; title: string };
type Next = Dated[] | { needs: string };

/** The next due date(s) for a dated rule, on or after today unless already overdue. */
export function nextDue(rule: Rule, facts: Facts, today: ISODate): Next {
  const s = rule.schedule;
  const fin = (d: ISODate) => (rule.roll_forward ? rollForward(d) : d);
  const ty = year(today);
  switch (s.type) {
    case "every_n_years": {
      for (let y = ty; y <= ty + s.n; y++) {
        if ((((y - s.anchor_year) % s.n) + s.n) % s.n !== 0) continue;
        const d = fin(ymd(y, s.month, s.day));
        if (d >= today) return [{ due_on: d, title: rule.title }];
      }
      return [];
    }
    case "annual":
      return s.dates.map((d) => {
        let raw = ymd(ty, d.month, d.day);
        if (fin(raw) < today) raw = ymd(ty + 1, d.month, d.day);
        return { due_on: fin(raw), title: label(d.label, raw) };
      });
    case "once":
      return s.date >= today ? [{ due_on: fin(s.date), title: rule.title }] : [];
    case "after_fact": {
      const base = facts[s.fact];
      if (!base) return { needs: s.fact };
      const step = (d: ISODate) => addDays(addMonths(d, s.months), s.days);
      let d = s.start_at_fact ? base : step(base);
      if (s.repeat && (s.months > 0 || s.days > 0)) while (d < today) d = step(d);
      return [{ due_on: fin(d), title: rule.title }];
    }
    case "before_anniversary_month": {
      const formed = facts[s.fact];
      if (!formed) return { needs: s.fact };
      const m = Number(formed.slice(5, 7));
      // The first report is due the year after formation; due the day before the anniversary month starts.
      for (let y = Math.max(ty, year(formed) + 1); y <= ty + 2; y++) {
        const d = fin(addDays(ymd(y, m, 1), -1));
        if (d >= today) return [{ due_on: d, title: rule.title }];
      }
      return [];
    }
    case "days_after_year_end": {
      let d = addDays(ymd(ty - 1, 12, 31), s.days);
      if (d < today) d = addDays(ymd(ty, 12, 31), s.days);
      return [{ due_on: fin(d), title: rule.title }];
    }
    default:
      return [];
  }
}

function ceProgress(rule: Rule, facts: Facts): CeProgress | undefined {
  if (!rule.ce) return undefined;
  const done = new Set(facts.ce_topics_done);
  return {
    required: rule.ce.hours,
    done: facts.ce_hours_done,
    topics_left: rule.ce.topics
      .filter((t) => !t.only_if || facts[t.only_if])
      .filter((t) => !done.has(t.id))
      .map((t) => ({ id: t.id, label: t.label, hours: t.hours, optional: t.optional_note ?? null })),
  };
}

export function buildCalendar(rules: Rule[], facts: Facts, today: ISODate): Calendar {
  const cal: Calendar = { due: [], clocks: [], setups: [], notes: [], needs_facts: [] };
  for (const rule of rulesFor(rules, facts)) {
    if (rule.kind === "clock") cal.clocks.push(rule);
    else if (rule.kind === "setup") cal.setups.push(rule);
    else if (rule.kind === "note") cal.notes.push(rule);
    else {
      const next = nextDue(rule, facts, today);
      if (!Array.isArray(next)) {
        cal.needs_facts.push({ rule_id: rule.id, title: rule.title, fact: next.needs });
        continue;
      }
      for (const n of next) {
        cal.due.push({
          rule_id: rule.id,
          title: n.title,
          due_on: n.due_on,
          days_left: daysBetween(today, n.due_on),
          urgency: urgency(n.due_on, today, rule.lead),
          rule,
          ...(rule.ce ? { ce: ceProgress(rule, facts) } : {}),
        });
      }
    }
  }
  cal.due.sort((a, b) => a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title));
  return cal;
}

/** Dated items due within `days` of today, overdue ones included. */
export function dueWithin(cal: Calendar, days: number): DueItem[] {
  return cal.due.filter((d) => d.days_left <= days);
}
