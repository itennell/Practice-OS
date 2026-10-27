import { chat, searchGrounded, type GroundedAnswer } from "../meta";
import { normalizeForMatch, quoteOnPage, type PageCheck } from "./page-check";
import { CATEGORIES, type Credential, type Rule, type RuleInput } from "./types";
import { checkRule } from "./validate";

// Muse researches a state's compliance rules, one topic at a time, in two calls:
//   1. muse-spark-1.3 + web_search answers with exact quotes and citations.
//   2. muse-spark-1.3 + a JSON schema turns that answer into rules in our format.
// Code then decides what counts: the rule must pass checkRule, its quote must sit
// in a passage Muse cited from that same official URL, and when the page can be
// read, the quote must be on it. Nothing here saves a rule; the caller queues the
// result for the clinician's approval.

export type ResearchContext = {
  state: string; // "CA"
  stateName: string; // "California"
  credential: Credential;
  credentialLabel: string; // "LCSW (licensed clinical social worker)"
  today: string;
};

export type Topic = {
  id: string;
  label: string;
  /** The rule categories this topic may produce; anything else belongs to another topic. */
  categories: (typeof CATEGORIES)[number][];
  context: "low" | "medium" | "high";
  /** Rules from this topic apply only to her license (license renewal, CE). */
  licenseOnly: boolean;
  /** Only worth researching once she has employees (payroll, unemployment, leave, training). */
  employerOnly?: boolean;
  question: (c: ResearchContext) => string;
};

const HOW =
  "Use only official sources: the state licensing board, the state's statutes or administrative code, or a state agency. " +
  "For every fact, quote the exact sentence from the official page in quotation marks and cite that page. " +
  "Use at most 3 searches and open at most 2 pages; prefer the board's own page over long statute PDFs. " +
  "Use only rules in effect now: never proposed or pending regulations. " +
  "If something isn't stated on an official page, say it wasn't found instead of guessing.";

export const TOPICS: Topic[] = [
  {
    id: "license_renewal",
    categories: ["license_renewal", "license_window"],
    label: "License renewal",
    context: "low",
    licenseOnly: true,
    question: (c) =>
      `For a ${c.credentialLabel} license in ${c.stateName}: when does the license expire and how often must it be renewed? ` +
      `Is the expiration a fixed date for everyone, or based on the licensee's birth month or issue date? ${HOW}`,
  },
  {
    id: "continuing_education",
    categories: ["ce_hours"],
    label: "Continuing education",
    context: "medium",
    licenseOnly: true,
    question: (c) =>
      `For a ${c.credentialLabel} license in ${c.stateName}: how many continuing education hours are required per renewal, ` +
      `which topics are required and how often (every renewal or one time), and is the first renewal exempt? ${HOW}`,
  },
  {
    id: "entity_filing",
    categories: ["pllc_annual_report", "pllc_registration", "business_setup"],
    label: "Entity filing",
    context: "low",
    licenseOnly: false,
    question: (c) =>
      `A ${c.credentialLabel} in ${c.stateName} runs her own private practice. Which business entity may she use for it ` +
      `(may a licensed ${c.credentialLabel} use an LLC, or must it be a professional corporation or professional LLC)? ` +
      `What recurring report must that entity file with the Secretary of State (or equivalent), when is it due, what is the fee, ` +
      `and is there a yearly state franchise fee or minimum tax for it? Does her licensing board require the entity to register with it? ` +
      `Only rules for her profession; ignore rules for other professions. ${HOW}`,
  },
  {
    id: "state_tax",
    categories: ["business_tax_return", "quarterly_taxes"],
    label: "State income and estimated tax",
    context: "low",
    licenseOnly: false,
    question: (c) =>
      `Does ${c.stateName} have a personal income tax? If so, when are the individual return and quarterly estimated tax payments due? ${HOW}`,
  },
  {
    id: "payroll",
    categories: ["payroll"],
    employerOnly: true,
    label: "Payroll withholding",
    context: "medium",
    licenseOnly: false,
    question: (c) =>
      `For a small employer in ${c.stateName}: when are state payroll withholding returns due, and how are deposits scheduled? ${HOW}`,
  },
  {
    id: "unemployment_new_hire",
    categories: ["payroll"],
    employerOnly: true,
    label: "Unemployment insurance and new hires",
    context: "medium",
    licenseOnly: false,
    question: (c) =>
      `For a small employer in ${c.stateName}: when must it register for state unemployment insurance, when are quarterly wage reports due, ` +
      `and within how many days must a new hire be reported? ${HOW}`,
  },
  {
    id: "workers_comp_leave",
    categories: ["insurance", "payroll"],
    employerOnly: true,
    label: "Workers' comp and paid leave",
    context: "medium",
    licenseOnly: false,
    question: (c) =>
      `In ${c.stateName}, must an employer with one employee carry workers' compensation insurance, and does state law require paid sick leave (how much)? ${HOW}`,
  },
  {
    id: "harassment_training",
    categories: ["payroll"],
    employerOnly: true,
    label: "Harassment training",
    context: "low",
    licenseOnly: false,
    question: (c) => `Does ${c.stateName} require employers to give employees sexual harassment prevention training, and how often? ${HOW}`,
  },
  {
    id: "records_reporting",
    categories: ["hipaa", "reporting_duty"],
    label: "Records and reporting duties",
    context: "medium",
    licenseOnly: true,
    question: (c) =>
      `For a ${c.credentialLabel} in ${c.stateName}: how long must client records be kept, and what mandated reporting training is required and how often? ${HOW}`,
  },
  {
    id: "telehealth_compacts",
    categories: ["telehealth"],
    label: "Telehealth and compacts",
    context: "low",
    licenseOnly: true,
    question: (c) =>
      `Is ${c.stateName} a member of an interstate licensure compact that covers a ${c.credentialLabel} (Counseling Compact, Social Work Licensure Compact, PSYPACT), and is it operational? ${HOW}`,
  },
];

// ---- Step 2: the answer becomes draft rules (structured output) -------------
// Cookbook: 01_api_fundamentals/04_structured_output.ipynb (cell 6): response_format json_schema.

const nullable = (type: string) => ({ type: [type, "null"] });

export const DRAFT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rules", "not_found"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "key", "kind", "category", "title", "schedule_type", "month", "day", "anchor_year", "every_years",
          "annual_label", "clock_event", "clock_days", "reask_days", "ce_hours", "ce_topics", "what_to_do",
          "you_must", "source_url", "quote",
        ],
        properties: {
          key: { type: "string", description: "short snake_case name, e.g. license_renewal" },
          kind: { type: "string", enum: ["deadline", "clock", "setup", "note"] },
          category: { type: "string", enum: [...CATEGORIES] },
          title: { type: "string" },
          schedule_type: {
            type: "string",
            enum: ["every_n_years", "annual", "license_expiration", "clock", "setup", "none"],
            description:
              "every_n_years: a fixed month/day every n years (needs month, day, anchor_year = a year it falls on, every_years). " +
              "annual: a fixed month/day each year. license_expiration: it falls on the licensee's own expiration date (birth month or issue date), repeating every_years. " +
              "clock: counts days from an event. setup: something to set up once and review. none: a note with no date.",
          },
          month: nullable("integer"),
          day: nullable("integer"),
          anchor_year: nullable("integer"),
          every_years: nullable("integer"),
          annual_label: nullable("string"),
          clock_event: nullable("string"),
          clock_days: nullable("integer"),
          reask_days: nullable("integer"),
          ce_hours: nullable("number"),
          ce_topics: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["label", "hours", "cadence"],
              properties: {
                label: { type: "string" },
                hours: { type: "number" },
                cadence: { type: "string", enum: ["every_renewal", "every_6_years", "once"] },
              },
            },
          },
          what_to_do: { type: "string", description: "plain words, one or two sentences" },
          you_must: { ...nullable("string"), description: "the part only the clinician can do (sign, attest, pay), or null" },
          source_url: { type: "string", description: "the cited URL the quote comes from, exactly as cited" },
          quote: { type: "string", description: "copied character for character from that cited passage, at most 25 words" },
        },
      },
    },
    not_found: { type: "array", items: { type: "string" } },
  },
} as const;

export type DraftRule = {
  key: string;
  kind: "deadline" | "clock" | "setup" | "note";
  category: (typeof CATEGORIES)[number];
  title: string;
  schedule_type: "every_n_years" | "annual" | "license_expiration" | "clock" | "setup" | "none";
  month: number | null;
  day: number | null;
  anchor_year: number | null;
  every_years: number | null;
  annual_label: string | null;
  clock_event: string | null;
  clock_days: number | null;
  reask_days: number | null;
  ce_hours: number | null;
  ce_topics: { label: string; hours: number; cadence: "every_renewal" | "every_6_years" | "once" }[];
  what_to_do: string;
  you_must: string | null;
  source_url: string;
  quote: string;
};

export type Drafts = { rules: DraftRule[]; not_found: string[] };

function extractionPrompt(c: ResearchContext, topic: Topic, answer: GroundedAnswer): string {
  const cited = answer.citations.map((x, i) => `[${i + 1}] ${x.url}\n${x.passage.trim()}`).join("\n\n");
  return [
    `Turn this research answer about ${topic.label} for a ${c.credentialLabel} in ${c.stateName} into compliance rules.`,
    "Rules:",
    "- Only use facts that a CITED PASSAGE below states. Never invent a date, cycle, number or fee.",
    "- quote must be copied character for character from one cited passage (no paraphrase, at most 25 words), and source_url must be that passage's URL exactly.",
    `- Only make rules about ${topic.label.toLowerCase()}; other topics are researched separately.`,
    "- Use kind 'deadline' for dates, 'clock' for 'within N days of an event', 'setup' for things to set up once, 'note' for facts with no date.",
    "- At most one note, and only if it changes what she must do. Skip definitions and history.",
    "- If a payment on a date is 0% or not required, make it a note, not a deadline.",
    `- Only rules that apply to a ${c.credentialLabel}; drop anything about other professions.`,
    "- Never use a proposed or pending regulation as a source.",
    "- For continuing education, make one rule of category ce_hours with schedule_type matching the license renewal, plus ce_hours and ce_topics.",
    "- Fill unused fields with null (ce_topics: empty list). Put anything the answer says wasn't found in not_found.",
    "",
    `ANSWER:\n${answer.text}`,
    "",
    `CITED PASSAGES:\n${cited || "(none)"}`,
  ].join("\n");
}

const LEAD: Partial<Record<DraftRule["category"], { red: number; yellow: number }>> = {
  license_renewal: { red: 30, yellow: 90 },
  ce_hours: { red: 60, yellow: 180 },
};

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "rule";
}

/** A draft from Muse becomes a rule input. Returns a reason instead when the draft can't become a dated rule. */
export function draftToRule(d: DraftRule, c: ResearchContext, topic: Topic, citationTitle: string): RuleInput | { error: string } {
  const schedule = (() => {
    switch (d.schedule_type) {
      case "every_n_years":
        if (d.month === null || d.day === null || d.anchor_year === null || d.every_years === null) return null;
        return { type: "every_n_years" as const, month: d.month, day: d.day, anchor_year: d.anchor_year, n: d.every_years };
      case "annual":
        if (d.month === null || d.day === null) return null;
        return { type: "annual" as const, dates: [{ month: d.month, day: d.day, label: d.annual_label ?? `${d.title} ({Y})` }] };
      case "license_expiration":
        if (d.every_years === null) return null;
        return { type: "after_fact" as const, fact: "license_expires_on" as const, months: d.every_years * 12, repeat: true, start_at_fact: true };
      case "clock":
        if (d.clock_event === null || d.clock_days === null) return null;
        return { type: "clock" as const, event: d.clock_event, days: d.clock_days };
      case "setup":
        return { type: "setup" as const, reask_days: d.reask_days ?? 365 };
      case "none":
        return { type: "none" as const };
    }
  })();
  if (!schedule) return { error: `schedule ${d.schedule_type} is missing a value it needs` };

  const prefix = `${c.state.toLowerCase()}_${topic.licenseOnly ? `${c.credential.toLowerCase()}_` : ""}`;
  const kind = schedule.type === "clock" ? "clock" : schedule.type === "setup" ? "setup" : schedule.type === "none" ? "note" : "deadline";
  return {
    id: `${prefix}${slug(d.key).replace(new RegExp(`^(${c.state.toLowerCase()}_)?(${c.credential.toLowerCase()}_)?`), "") || "rule"}`,
    kind,
    jurisdiction: c.state,
    category: d.category,
    title: d.title,
    applies_to: topic.licenseOnly ? { credentials: [c.credential] } : {},
    schedule,
    lead: LEAD[d.category] ?? { red: 14, yellow: 45 },
    what_to_do: d.what_to_do,
    you_must: d.you_must,
    guide: null,
    ...(d.category === "ce_hours" && d.ce_hours
      ? {
          ce: {
            hours: d.ce_hours,
            topics: d.ce_topics.map((t, i) => ({ id: `${slug(t.label)}_${i}`, label: t.label, hours: t.hours, cadence: t.cadence })),
          },
        }
      : {}),
    source: { citation: citationTitle || d.source_url, url: d.source_url, quote: d.quote, checked_on: c.today, evidence: "cited" },
    verified_by: "agent",
  };
}

const sameUrl = (a: string, b: string) => {
  const n = (u: string) => u.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/[#?].*$/, "").replace(/\/$/, "");
  return n(a) === n(b);
};

/** The quote must sit in a passage Muse cited from the same URL. */
export function quoteInCitations(rule: { source: { url?: string; quote?: string } }, answer: GroundedAnswer): boolean {
  const { url, quote } = rule.source;
  if (!url || !quote) return false;
  const q = normalizeForMatch(quote);
  return q.length > 0 && answer.citations.some((c) => sameUrl(c.url, url) && normalizeForMatch(c.passage).includes(q));
}

export type Dropped = { title: string; reasons: string[] };
export type TopicResult = {
  topic: string;
  rules: Rule[];
  dropped: Dropped[];
  not_found: string[];
  page_checks: { rule_id: string; result: PageCheck; detail: string }[];
  tokens: number;
  calls: number;
  /** Raw replies, for saving as fixtures. */
  raw: { search: unknown; extraction: unknown };
};

type PageChecker = (url: string, quote: string) => Promise<{ result: PageCheck; detail: string }>;

/** Checks drafts against the evidence. Pure apart from the page reads, so tests can pass a fake checker. */
export async function vetDrafts(
  drafts: Drafts,
  answer: GroundedAnswer,
  c: ResearchContext,
  topic: Topic,
  pageCheck: PageChecker = quoteOnPage,
): Promise<Pick<TopicResult, "rules" | "dropped" | "page_checks">> {
  const rules: Rule[] = [];
  const dropped: Dropped[] = [];
  const page_checks: TopicResult["page_checks"] = [];
  const seen = new Set<string>();
  for (const d of drafts.rules) {
    if (!topic.categories.includes(d.category)) {
      dropped.push({ title: d.title, reasons: [`a ${d.category} rule belongs to another topic, not ${topic.label.toLowerCase()}`] });
      continue;
    }
    const title = answer.citations.find((x) => sameUrl(x.url, d.source_url))?.title ?? "";
    const input = draftToRule(d, c, topic, title);
    if ("error" in input) {
      dropped.push({ title: d.title, reasons: [input.error] });
      continue;
    }
    if (seen.has(input.id)) input.id = `${input.id}_${seen.size}`;
    if (/\/(pending|proposed)\//i.test(d.source_url)) {
      dropped.push({ title: d.title, reasons: ["the source is a proposed or pending regulation, not a rule in effect"] });
      continue;
    }
    const checked = checkRule(input, c.today);
    if (!checked.ok) {
      dropped.push({ title: d.title, reasons: checked.errors });
      continue;
    }
    if (!quoteInCitations(checked.rule, answer)) {
      dropped.push({ title: d.title, reasons: ["the quote isn't in a passage Muse cited from that URL"] });
      continue;
    }
    const page = await pageCheck(checked.rule.source.url as string, checked.rule.source.quote as string);
    page_checks.push({ rule_id: checked.rule.id, ...page });
    if (page.result === "not_on_page") {
      dropped.push({ title: d.title, reasons: ["we read the cited page and the quote isn't on it"] });
      continue;
    }
    if (page.result === "on_page") checked.rule.source.evidence = "page";
    seen.add(checked.rule.id);
    rules.push(checked.rule);
  }
  return { rules, dropped, page_checks };
}

/** Step 2 alone: the cited answer becomes draft rules (cheap; reruns without a new search). */
export function extractDrafts(c: ResearchContext, topic: Topic, answer: GroundedAnswer) {
  return chat(`research.${topic.id}.extract`, {
    messages: [{ role: "user", content: extractionPrompt(c, topic, answer) }],
    response_format: { type: "json_schema", json_schema: { name: "compliance_rules", schema: DRAFT_SCHEMA as never } },
  });
}

export async function researchTopic(
  c: ResearchContext,
  topic: Topic,
  opts: { pageCheck?: PageChecker; onRaw?: (raw: TopicResult["raw"]) => Promise<void> } = {},
): Promise<TopicResult> {
  const { response: search, answer } = await searchGrounded(`research.${topic.id}`, topic.question(c), {
    context: topic.context,
    effort: "low",
    location: { country: "US", region: c.stateName },
  });
  const extraction = await extractDrafts(c, topic, answer);
  // Keep Muse's replies before any page reads, so a slow page never wastes a paid search.
  await opts.onRaw?.({ search, extraction });
  const drafts = JSON.parse(extraction.choices[0]?.message.content ?? '{"rules":[],"not_found":[]}') as Drafts;
  const vetted = await vetDrafts(drafts, answer, c, topic, opts.pageCheck ?? quoteOnPage);
  return {
    topic: topic.id,
    ...vetted,
    not_found: drafts.not_found,
    tokens: (answer.tokens ?? 0) + (extraction.usage?.total_tokens ?? 0),
    calls: 2,
    raw: { search, extraction },
  };
}

/** Topics worth researching for this practice: employer topics wait until she has employees. */
export function topicsFor(employeeCount: number, topics: Topic[] = TOPICS): Topic[] {
  return topics.filter((t) => !t.employerOnly || employeeCount > 0);
}

/** Every relevant topic, one after another (each is two calls). The caller queues the result for approval. */
export async function researchState(c: ResearchContext, employeeCount: number, topics: Topic[] = TOPICS): Promise<TopicResult[]> {
  const results: TopicResult[] = [];
  for (const t of topicsFor(employeeCount, topics)) results.push(await researchTopic(c, t));
  return results;
}

/** Tokens and calls across a state's research (the cost the clinician's key pays). */
export function researchCost(results: TopicResult[]): { calls: number; tokens: number } {
  return results.reduce((a, r) => ({ calls: a.calls + r.calls, tokens: a.tokens + r.tokens }), { calls: 0, tokens: 0 });
}
