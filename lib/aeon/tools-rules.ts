// Chat tools that answer from the rules and guides Practice-OS already ships
// (lib/compliance/rules, skills/admin/references via lib/guides.ts). Before these,
// Aeon said "I don't know" to "how many CE hours does an Illinois LCPC need",
// "do I need a security risk analysis" or "how do I form my PLLC", and "what's due
// this month" only saw the next 7 days. Each answer carries the rule's source.
import { z } from "zod";
import { addDays, addMonths, daysBetween, type ISODate } from "../compliance/dates";
import { loadSavedRules } from "../compliance/researched";
import { SHIPPED_RULES } from "../compliance/rules";
import { applies } from "../compliance/schedule";
import { loadFacts, practiceToday } from "../compliance/store";
import type { Facts, Rule } from "../compliance/types";
import { deadlinesView } from "../compliance/view";
import { db } from "../db";
import { allGuides, type Guide } from "../guides";
import { listPayerApplications } from "../payers/store";
import type { AeonTool, ToolContext, ToolResult } from "./tools";

/** Said plainly instead of a null the model could fill in: a few setup reminders rest on no official page. */
export const NO_SOURCE = "no official source";

const json = (value: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

function tool<I extends z.ZodRawShape>(
  def: Omit<AeonTool, "run" | "input"> & { input: I; run: (input: z.infer<z.ZodObject<I>>, ctx: ToolContext) => Promise<ToolResult> },
): AeonTool {
  return def as unknown as AeonTool;
}

// ---- Search ------------------------------------------------------------------------------

const STOP = new Set(
  "a an and are as at be by can could did do does for from get got have how i if in is it its me my need needs of on or should so that the this to we what when where which who why will with you your about any there".split(" "),
);
/** Her words to the words the rules use. */
const ALIASES: Record<string, string[]> = {
  ce: ["continuing", "education"],
  ceu: ["ce", "continuing", "education"],
  ceus: ["ce", "continuing", "education"],
  continuing: ["ce"],
  gfe: ["good", "faith", "estimate"],
  pllc: ["llc", "entity"],
  llc: ["pllc"],
  sra: ["risk", "analysis", "security"],
  baa: ["business", "associate"],
  caqh: ["attestation", "attest"],
  taxes: ["tax"],
  quarterly: ["estimated"],
  insurance: ["insured", "payer"],
  il: ["illinois"],
  illinois: ["il"],
  federal: ["us"],
  renew: ["renewal"],
  form: ["formed", "registration"],
};
const STATE_NAMES: Record<string, string> = { US: "federal us", IL: "illinois il", "IL-CHI": "illinois chicago" };

export function words(q: string): string[] {
  const base = q
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w));
  return [...new Set(base.flatMap((w) => [w, ...(ALIASES[w] ?? [])]))];
}

/** How many of her words a text holds (a word counts when it starts a word in the text). */
export function score(queryWords: string[], hay: string): number {
  const hayWords = new Set(hay.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean));
  return queryWords.filter((w) => [...hayWords].some((h) => h === w || (w.length >= 4 && h.startsWith(w)))).length;
}

const ruleHay = (r: Rule) =>
  [
    r.title,
    r.category.replace(/_/g, " "),
    r.what_to_do,
    r.you_must ?? "",
    r.source.citation,
    STATE_NAMES[r.jurisdiction] ?? r.jurisdiction,
    ...(r.applies_to.credentials ?? []),
    ...(r.ce ? ["ce continuing education hours", ...r.ce.topics.map((t) => t.label)] : []),
    r.kind === "clock" && r.schedule.type === "clock" ? r.schedule.event : "",
  ].join(" ");

const guideHay = (g: Guide) => [g.slug.replace(/-/g, " "), g.title, g.summary].join(" ");

export function ruleView(r: Rule, facts: Facts | null, nextDue: ISODate | null) {
  return {
    id: r.id,
    title: r.title,
    jurisdiction: r.jurisdiction,
    applies_to_her: facts ? applies(r, facts) : null,
    ...(r.applies_to.credentials ? { for_licenses: r.applies_to.credentials } : {}),
    what_to_do: r.what_to_do,
    you_must: r.you_must,
    ...(r.ce ? { ce: { hours: r.ce.hours, topics: r.ce.topics.map((t) => ({ topic: t.label, hours: t.hours, cadence: t.cadence, ...(t.optional_note ? { optional: t.optional_note } : {}) })) } } : {}),
    ...(r.schedule.type === "clock" ? { starts_when: r.schedule.event } : {}),
    next_due_on: nextDue,
    source: { citation: r.source.citation, url: r.source.url ?? NO_SOURCE, quote: r.source.quote ?? null, checked_on: r.source.checked_on },
    verified: r.verified_by !== "agent",
    ...(r.verified_by === "agent" ? { label: "Aeon researched, please confirm" } : {}),
    ...(r.caveat ? { caveat: r.caveat } : {}),
    ...(r.guide ? { guide: r.guide } : {}),
  };
}

export function guideView(g: Guide) {
  return {
    slug: g.slug,
    title: g.title,
    summary: g.summary,
    official_url: g.official_url,
    last_verified: g.last_verified,
    sources: g.sources,
    sections: g.sections.map((s) => ({ heading: s.heading, items: s.items.map((i) => (i.you ? `[Only she can] ${i.text}` : i.text)) })),
  };
}

/**
 * Rules (federal and her state's: the shipped, maintainer-verified ones plus researched ones saved after she approved
 * the research; until she confirms a researched rule it is labeled "Aeon researched, please confirm") and guides that
 * match her words, best first.
 */
export async function lookUpRules(query: string, opts: { limit?: number } = {}) {
  const limit = opts.limit ?? 5;
  const [facts, saved] = await Promise.all([loadFacts(), loadSavedRules()]);
  const state = facts?.practice_state ?? "IL";
  const pool = [...SHIPPED_RULES, ...saved].filter((r) => r.jurisdiction === "US" || r.jurisdiction.split("-")[0] === state);
  const q = words(query);
  const ranked = pool
    .map((r) => ({ r, s: score(q, ruleHay(r)) + (facts && applies(r, facts) ? 0.5 : 0) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  const ids = ranked.map((x) => x.r.id);
  const due = ids.length
    ? await db()<{ rule_id: string; due_on: Date | string }[]>`
        select rule_id, min(due_on) as due_on from practice_os.obligations
        where rule_id in ${db()(ids)} and due_on is not null and status in ('upcoming', 'snoozed', 'not_yet')
        group by rule_id`
    : [];
  const dueOf = new Map(due.map((d) => [d.rule_id, d.due_on instanceof Date ? d.due_on.toISOString().slice(0, 10) : String(d.due_on)]));
  const guides = allGuides()
    .map((g) => ({ g, s: score(q, guideHay(g)) }))
    .filter((x) => x.s >= 1)
    .sort((a, b) => b.s - a.s)
    .slice(0, 2);
  return {
    query,
    state,
    license_type: facts?.credential ?? null,
    rules: ranked.map((x) => ruleView(x.r, facts, dueOf.get(x.r.id) ?? null)),
    guides: guides.map((x) => guideView(x.g)),
    found: ranked.length + guides.length,
  };
}

// ---- A whole month of deadlines -----------------------------------------------------------

/** First and last day of a YYYY-MM month. */
export function monthRange(month: string): { start: ISODate; end: ISODate } {
  const start = `${month}-01`;
  return { start, end: addDays(addMonths(start, 1), -1) };
}

const RESEARCHED = "Aeon researched, please confirm";

type DeadlineRow = {
  title: string;
  due_on: ISODate | null;
  status?: string;
  what_to_do: string | null;
  you_must: string | null;
  citation: string | null;
  source_url: string | null;
  last_verified_on: ISODate | null;
  verified_by: string;
  ce?: unknown;
};

const deadlineView = (v: DeadlineRow, today: ISODate) => ({
  title: v.title,
  due_on: v.due_on,
  days_left: v.due_on ? daysBetween(today, v.due_on) : null,
  ...(v.status === "done" ? { done: true } : { overdue: v.due_on !== null && v.due_on < today }),
  what_to_do: v.what_to_do,
  you_must: v.you_must,
  source: { citation: v.citation ?? NO_SOURCE, url: v.source_url ?? NO_SOURCE, checked_on: v.last_verified_on },
  verified: v.verified_by !== "agent",
  ...(v.verified_by === "agent" ? { label: RESEARCHED } : {}),
  ...(v.ce ? { ce: v.ce } : {}),
});

const asDay = (d: unknown): ISODate | null => (d instanceof Date ? d.toISOString().slice(0, 10) : ((d as string | null) ?? null));

export async function deadlinesInMonth(month?: string) {
  const today = await practiceToday();
  const m = month ?? today.slice(0, 7);
  const { start, end } = monthRange(m);
  const thisMonth = m === today.slice(0, 7);
  let deadlines: ReturnType<typeof deadlineView>[];
  let isSample = false;
  if (end < today) {
    // A past month: what was due in it, done ones included, straight from the calendar rows.
    const rows = await db()`
      select title, due_on, status, what_to_do, you_must, citation, source_url, last_verified_on, verified_by, is_sample
        from practice_os.obligations
       where due_on between ${start} and ${end} and kind in ('deadline', 'clock') and status <> 'not_applicable'
       order by due_on, title`;
    deadlines = rows.map((r) => deadlineView({ ...(r as unknown as DeadlineRow), due_on: asDay(r.due_on), last_verified_on: asDay(r.last_verified_on) }, today));
    isSample = rows.some((r) => r.is_sample);
  } else {
    const view = await deadlinesView(Math.max(0, daysBetween(today, end)));
    // The whole month: every date in it, plus anything already overdue when it's this month.
    const inMonth = (d: ISODate | null) => d !== null && d <= end && (d >= start || (thisMonth && d < today));
    deadlines = view.due.filter((v) => inMonth(v.due_on)).map((v) => deadlineView(v, today));
    isSample = view.is_sample;
  }
  const inRange = (d: ISODate | null) => d !== null && d <= end && (d >= start || (thisMonth && d < today));
  const apps = await listPayerApplications();
  const insurance = apps.flatMap((a) => [
    ...(inRange(a.follow_up_on) ? [{ payer: a.payer, what: "Follow up on the application", due_on: a.follow_up_on }] : []),
    ...(inRange(a.recredential_on) ? [{ payer: a.payer, what: "Recredential", due_on: a.recredential_on }] : []),
  ]);
  return { today, month: m, from: start, to: end, deadlines, insurance_dates: insurance, is_sample: isSample };
}

export const RULES_TOOLS: AeonTool[] = [
  tool({
    name: "look_up_rules",
    title: "Look up a rule or how-to guide",
    description:
      "Searches the rules Practice-OS ships (federal and her state's, each with its official source) and the how-do-I guides, by her words. " +
      "Use it before saying you don't know any rule, requirement or how-to: CE hours and required topics for her license, license renewal, CAQH, " +
      "HIPAA (security risk analysis, privacy notice, BAAs), Good Faith Estimates (who needs one), PLLC annual report and how to form a PLLC, NPI, Medicare, taxes, payroll. " +
      "Each rule gives what to do, the part only she can do, CE hours and topics, whether it applies to her, the next due date, and its source " +
      "(citation, link, a short quote, date checked). Answer from it and name the source: the citation, the link and the date checked; " +
      "when the link is 'no official source', say there is no official source for it. A rule with verified false is " +
      "'Aeon researched, please confirm'. When nothing is found, say so; don't fill the gap from memory. Read-only.",
    input: { query: z.string().trim().min(2).max(200).describe("Her question in a few words, e.g. 'Illinois LCPC CE hours', 'security risk analysis', 'form a PLLC'.") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Looked up the rule",
    changesData: false,
    run: async ({ query }) => json(await lookUpRules(query)),
  }),

  tool({
    name: "deadlines_in_month",
    title: "Every deadline in a month",
    description:
      "Every deadline on her calendar in one calendar month (default: this month, first to last day, plus anything overdue), with what to do, " +
      "the part only she can do and each rule's source, plus insurance follow-up and recredential dates in that month. " +
      "Use it for 'what's due this month', 'anything due in December', 'what's coming up before year end' (call once per month). " +
      "A past month lists what was due then, done ones included (done: true). morning_brief covers only the next 7 days. Read-only.",
    input: { month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM").optional().describe("The month, YYYY-MM. Leave out for this month.") },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },
    label: "Checked this month's deadlines",
    changesData: false,
    run: async ({ month }) => json(await deadlinesInMonth(month)),
  }),
];
