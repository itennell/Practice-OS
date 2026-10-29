import { listPayerApplications, payerDates, type PayerDate } from "../payers/store";
import { formatBriefDate } from "./format";
import { deadlinesView, type ObligationView } from "./view";

// "What needs me this week?" The same rows as the Deadlines page, cut to this
// week, plus anything urgent just beyond it and the setup questions due today.
// Read-only: it never changes a row.

export const BRIEF_DAYS = 7;

export type BriefItem = {
  /** Use with answer_setup / log_event. */
  rule_id: string | null;
  title: string;
  due_on: string | null;
  days_left: number | null;
  urgency: string | null;
  what_to_do: string | null;
  you_must: string | null;
  source: string | null;
  needs_confirming: boolean;
};

export type MorningBrief = {
  today: string;
  this_week: BriefItem[];
  urgent_soon: BriefItem[];
  setup_questions: { rule_id: string | null; title: string; what_to_do: string | null }[];
  needs_dates: { title: string; question: string }[];
  /** Insurance follow-ups and recredential dates in the next 7 days, overdue included. */
  payer_dates: PayerDate[];
  is_sample: boolean;
  summary: string;
};

function item(o: ObligationView): BriefItem {
  return {
    rule_id: o.rule_id,
    title: o.title,
    due_on: o.due_on,
    days_left: o.days_left,
    urgency: o.urgency,
    what_to_do: o.what_to_do,
    you_must: o.you_must,
    source: o.citation,
    needs_confirming: o.verified_by === "agent",
  };
}

function when(i: BriefItem): string {
  if (i.days_left === null || !i.due_on) return "";
  if (i.days_left < 0) return `${-i.days_left} days overdue (was due ${formatBriefDate(i.due_on)})`;
  if (i.days_left === 0) return "due today";
  return `due ${formatBriefDate(i.due_on)}, in ${i.days_left} ${i.days_left === 1 ? "day" : "days"}`;
}

/** Plain text an agent can read aloud or paste: short, most urgent first. */
export function summarize(b: Omit<MorningBrief, "summary">): string {
  const lines: string[] = [];
  if (b.is_sample) lines.push("[Sample] Dana Reyes is a fictional demo practice.");
  // Insurance follow-ups count as this week too: never say "nothing is due" above one.
  if (b.this_week.length === 0 && b.payer_dates.length === 0) lines.push("Nothing is due in the next 7 days.");
  else if (b.this_week.length) {
    lines.push(`Due in the next 7 days (${b.this_week.length}):`);
    for (const i of b.this_week) lines.push(`- ${i.title}: ${when(i)}. ${i.you_must ? `You do this: ${i.you_must}` : ""}`.trim());
  }
  if (b.urgent_soon.length) {
    lines.push("Urgent soon:");
    for (const i of b.urgent_soon) lines.push(`- ${i.title}: ${when(i)}. ${i.you_must ? `You do this: ${i.you_must}` : ""}`.trim());
  }
  if (b.setup_questions.length) {
    lines.push(`Setup questions waiting (${b.setup_questions.length}): ${b.setup_questions.map((q) => q.title).join("; ")}.`);
  }
  if (b.needs_dates.length) lines.push(`Aeon needs a date for: ${b.needs_dates.map((n) => n.title).join("; ")}.`);
  if (b.payer_dates.length) {
    lines.push(`Insurance dates (${b.payer_dates.length}):`);
    for (const d of b.payer_dates) {
      const w = d.days_left < 0 ? `${-d.days_left} days overdue` : d.days_left === 0 ? "today" : `in ${d.days_left} days`;
      lines.push(`- ${d.what} (${w}, ${formatBriefDate(d.due_on)})`);
    }
  }
  lines.push("Details and sources are on the Deadlines page.");
  return lines.join("\n");
}

const DATE_QUESTION: Record<string, string> = {
  caqh_last_attested_on: "When did you last attest on CAQH?",
  pllc_formed_on: "When was your PLLC formed?",
  medicare_revalidation_due_on: "What revalidation date does data.cms.gov show?",
  medicare_opt_out_ends_on: "When does your Medicare opt-out period end?",
  impact_revalidation_due_on: "What revalidation date does IMPACT show?",
  apit_granted_on: "When was your PSYPACT APIT granted?",
};

export async function morningBrief(): Promise<MorningBrief> {
  const view = await deadlinesView(90);
  const dated = view.due.filter((o) => o.days_left !== null);
  const thisWeek = dated.filter((o) => (o.days_left as number) <= BRIEF_DAYS);
  const urgentSoon = dated.filter((o) => (o.days_left as number) > BRIEF_DAYS && o.urgency === "red");
  const base = {
    today: view.today,
    this_week: thisWeek.map(item),
    urgent_soon: urgentSoon.map(item),
    setup_questions: view.setups.map((s) => ({ rule_id: s.rule_id, title: s.title, what_to_do: s.what_to_do })),
    needs_dates: view.needs_facts.map((n) => ({ title: n.title, question: DATE_QUESTION[n.fact] ?? n.fact })),
    payer_dates: payerDates(await listPayerApplications(), view.today, BRIEF_DAYS),
    is_sample: view.is_sample,
  };
  return { ...base, summary: summarize(base) };
}
