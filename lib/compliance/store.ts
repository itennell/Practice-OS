import type postgres from "postgres";
import { db } from "../db";
import { todayIn, type ISODate } from "./dates";
import { loadSavedRules } from "./researched";
import { SHIPPED_RULES } from "./rules";
import { buildCalendar, type Calendar } from "./schedule";
import { factsSchema, type Facts, type Rule } from "./types";

// Reads the practice facts from the database and writes the calendar the
// rules produce into practice_os.obligations. Rows are upserted per rule and
// occurrence, so her answers on setup reminders (status, answered_on,
// next_ask_on) survive every rebuild.

/** Practice facts: compliance_facts plus state and credential from the profile. Null before onboarding. */
export async function loadFacts(sql: postgres.Sql = db()): Promise<Facts | null> {
  const [row] = await sql`
    select f.*, p.state as practice_state, p.credential
    from practice_os.compliance_facts f
    cross join practice_os.clinician_profile p
    limit 1`;
  if (!row) return null;
  const dateOrNull = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v as string | null));
  return factsSchema.parse({
    ...row,
    city: row.city_code,
    ce_hours_done: Number(row.ce_hours_done),
    pllc_formed_on: dateOrNull(row.pllc_formed_on),
    medicare_revalidation_due_on: dateOrNull(row.medicare_revalidation_due_on),
    medicare_opt_out_ends_on: dateOrNull(row.medicare_opt_out_ends_on),
    impact_revalidation_due_on: dateOrNull(row.impact_revalidation_due_on),
    caqh_last_attested_on: dateOrNull(row.caqh_last_attested_on),
    apit_granted_on: dateOrNull(row.apit_granted_on),
    license_expires_on: dateOrNull(row.license_expires_on ?? null),
  } satisfies Record<string, unknown>);
}

export async function practiceToday(sql: postgres.Sql = db()): Promise<ISODate> {
  const [s] = await sql`select timezone from practice_os.settings limit 1`;
  return todayIn(s?.timezone ?? "America/Chicago");
}

type Row = {
  rule: Rule;
  title: string;
  due_on: ISODate | null;
  ce?: { required: number; done: number; topics_left: unknown[] };
};

function rowsFor(cal: Calendar): Row[] {
  return [
    ...cal.due.map((d) => ({ rule: d.rule, title: d.title, due_on: d.due_on, ce: d.ce })),
    ...cal.setups.map((rule) => ({ rule, title: rule.title, due_on: null })),
    ...cal.notes.map((rule) => ({ rule, title: rule.title, due_on: null })),
  ];
}

/**
 * Rebuilds the calendar from the rules and the current facts. Removes rows
 * for rules that no longer apply or dates that moved, unless she already
 * acted on them (done, snoozed, not_yet or not_applicable).
 */
export async function syncCalendar(
  sql: postgres.Sql = db(),
  opts: { today?: ISODate; rules?: Rule[] } = {},
): Promise<{ today: ISODate; written: number; removed: number; needs_facts: Calendar["needs_facts"] }> {
  const facts = await loadFacts(sql);
  const today = opts.today ?? (await practiceToday(sql));
  if (!facts) return { today, written: 0, removed: 0, needs_facts: [] };

  // Shipped rules plus the researched rules she approved.
  const rules = opts.rules ?? [...SHIPPED_RULES, ...(await loadSavedRules(sql))];
  const cal = buildCalendar(rules, facts, today);
  const rows = rowsFor(cal);

  return sql.begin(async (tx) => {
    const keep: string[] = [];
    for (const r of rows) {
      const { rule } = r;
      const [saved] = await tx`
        insert into practice_os.obligations (
          rule_id, kind, title, category, due_on, jurisdiction, verified_by,
          lead_red_days, lead_yellow_days, what_to_do, you_must, guide_slug,
          citation, source_url, quote, last_verified_on, caveat, evidence,
          ce_required, ce_done, ce_topics_left, next_ask_on, is_sample
        ) values (
          ${rule.id}, ${rule.kind}, ${r.title}, ${rule.category}, ${r.due_on}, ${rule.jurisdiction}, ${rule.verified_by},
          ${rule.lead.red}, ${rule.lead.yellow}, ${rule.what_to_do}, ${rule.you_must}, ${rule.guide},
          ${rule.source.citation}, ${rule.source.url ?? null}, ${rule.source.quote ?? null}, ${rule.source.checked_on}, ${rule.caveat ?? null},
          ${rule.verified_by === "maintainer" ? null : (rule.source.evidence ?? "cited")},
          ${r.ce?.required ?? null}, ${r.ce?.done ?? null}, ${r.ce ? tx.json(r.ce.topics_left as never) : null},
          ${rule.kind === "setup" ? today : null}, ${facts.is_sample}
        )
        on conflict (rule_id, due_on, started_on) where rule_id is not null do update set
          kind = excluded.kind, title = excluded.title, category = excluded.category,
          jurisdiction = excluded.jurisdiction, verified_by = excluded.verified_by,
          lead_red_days = excluded.lead_red_days, lead_yellow_days = excluded.lead_yellow_days,
          what_to_do = excluded.what_to_do, you_must = excluded.you_must, guide_slug = excluded.guide_slug,
          citation = excluded.citation, source_url = excluded.source_url, quote = excluded.quote,
          last_verified_on = excluded.last_verified_on, caveat = excluded.caveat, evidence = excluded.evidence,
          ce_required = excluded.ce_required, ce_done = excluded.ce_done, ce_topics_left = excluded.ce_topics_left,
          is_sample = excluded.is_sample
        returning id`;
      keep.push(saved.id);
    }
    // Started clocks are kept: they come from events she logged, not from the rules.
    const removed = await tx`
      delete from practice_os.obligations
      where rule_id is not null and kind <> 'clock' and status = 'upcoming'
        and not (id = any(${keep}::uuid[]))
      returning id`;
    return { today, written: keep.length, removed: removed.length, needs_facts: cal.needs_facts };
  });
}
