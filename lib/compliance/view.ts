import { db } from "../db";
import { addDays, daysBetween, type ISODate } from "./dates";
import { SHIPPED_RULES } from "./rules";
import { buildCalendar, urgency, type Urgency } from "./schedule";
import { loadFacts, practiceToday } from "./store";

// What the Deadlines page and morning_brief show, read from practice_os.obligations.

export type ObligationView = {
  id: string;
  rule_id: string | null;
  kind: "deadline" | "clock" | "setup" | "note";
  title: string;
  category: string;
  due_on: ISODate | null;
  days_left: number | null;
  urgency: Urgency | null;
  jurisdiction: string;
  verified_by: "maintainer" | "agent" | "clinician";
  what_to_do: string | null;
  you_must: string | null;
  guide_slug: string | null;
  citation: string | null;
  source_url: string | null;
  last_verified_on: ISODate | null;
  caveat: string | null;
  ce: { required: number; done: number; topics_left: { id: string; label: string; hours: number; optional: string | null }[] } | null;
  status: string;
  answered_on: ISODate | null;
  next_ask_on: ISODate | null;
  is_sample: boolean;
};

const asDate = (v: unknown): ISODate | null => (v instanceof Date ? v.toISOString().slice(0, 10) : ((v as string | null) ?? null));

function toView(row: Record<string, unknown>, today: ISODate): ObligationView {
  const due = asDate(row.due_on);
  const lead = { red: Number(row.lead_red_days), yellow: Number(row.lead_yellow_days) };
  return {
    id: String(row.id),
    rule_id: (row.rule_id as string | null) ?? null,
    kind: row.kind as ObligationView["kind"],
    title: String(row.title),
    category: String(row.category),
    due_on: due,
    days_left: due ? daysBetween(today, due) : null,
    urgency: due ? urgency(due, today, lead) : null,
    jurisdiction: String(row.jurisdiction),
    verified_by: row.verified_by as ObligationView["verified_by"],
    what_to_do: (row.what_to_do as string | null) ?? null,
    you_must: (row.you_must as string | null) ?? null,
    guide_slug: (row.guide_slug as string | null) ?? null,
    citation: (row.citation as string | null) ?? null,
    source_url: (row.source_url as string | null) ?? null,
    last_verified_on: asDate(row.last_verified_on),
    caveat: (row.caveat as string | null) ?? null,
    ce:
      row.ce_required === null || row.ce_required === undefined
        ? null
        : {
            required: Number(row.ce_required),
            done: Number(row.ce_done ?? 0),
            topics_left: (row.ce_topics_left as NonNullable<ObligationView["ce"]>["topics_left"] | null) ?? [],
          },
    status: String(row.status),
    answered_on: asDate(row.answered_on),
    next_ask_on: asDate(row.next_ask_on),
    is_sample: Boolean(row.is_sample),
  };
}

export type DeadlinesView = {
  today: ISODate;
  days: number;
  due: ObligationView[];
  setups: ObligationView[];
  setups_done: number;
  notes: ObligationView[];
  needs_facts: { rule_id: string; title: string; fact: string }[];
  is_sample: boolean;
};

/** Deadlines due within `days` (overdue included), setup questions due to be asked, and notes. */
export async function deadlinesView(days = 90): Promise<DeadlinesView> {
  const sql = db();
  const today = await practiceToday(sql);
  const until = addDays(today, days);
  const rows = await sql`
    select * from practice_os.obligations
    where status in ('upcoming', 'not_yet', 'snoozed', 'done')
      and (kind <> 'deadline' or status <> 'done')
    order by due_on nulls last, title`;
  // A deadline shows when it's due within `days`, or earlier once its own warning window opens
  // (CE hours warn 180 days ahead).
  const views = rows
    .map((r) => toView(r, today))
    .filter((v) => v.kind !== "deadline" || (v.due_on !== null && (v.due_on <= until || v.urgency !== "green")));
  const setups = views.filter((v) => v.kind === "setup");
  const facts = await loadFacts(sql);
  return {
    today,
    days,
    due: views.filter((v) => v.kind === "deadline" || (v.kind === "clock" && v.due_on)),
    setups: setups.filter((v) => v.status !== "done" && (!v.next_ask_on || v.next_ask_on <= today)),
    setups_done: setups.filter((v) => v.status === "done").length,
    notes: views.filter((v) => v.kind === "note"),
    needs_facts: facts ? buildCalendar(SHIPPED_RULES, facts, today).needs_facts : [],
    is_sample: facts?.is_sample ?? views.some((v) => v.is_sample),
  };
}
