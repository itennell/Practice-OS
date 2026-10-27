import { daysBetween, toDate } from "./dates";
import { ruleSchema, type Rule } from "./types";

// Checks a rule before it reaches the calendar: the shipped rules in tests,
// and every rule the state-research skill proposes before it is saved. An
// agent-researched rule must point at an official page, quote it, and have
// been checked recently, so nothing unsourced can turn into a deadline.

/** Hosts we accept besides any .gov or .us site: boards, compacts, payers and vendors we cite. */
export const OFFICIAL_HOSTS = [
  "caqh.org",
  "dataspring.com",
  "bcbsil.com",
  "counselingcompact.org",
  "swcompact.org",
  "psypact.org",
  "myilsavings.com",
  "twilio.com",
  "supabase.com",
  "apa.org",
  "socialworkers.org",
  "counseling.org",
  "aamft.org",
  "asppb.net",
];

/** Agent-researched rules older than this need a re-check before they count. */
export const MAX_AGENT_AGE_DAYS = 180;

export function isOfficialUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host.endsWith(".gov") || host.endsWith(".us")) return true;
  return OFFICIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

export type RuleCheck = { ok: true; rule: Rule } | { ok: false; id: string; errors: string[] };

export function checkRule(input: unknown, today: string): RuleCheck {
  const parsed = ruleSchema.safeParse(input);
  const id = typeof input === "object" && input && "id" in input ? String((input as { id: unknown }).id) : "(no id)";
  if (!parsed.success) {
    return { ok: false, id, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "rule"}: ${i.message}`) };
  }
  const rule = parsed.data;
  const errors: string[] = [];

  if (rule.source.url && !isOfficialUrl(rule.source.url)) errors.push(`source.url is not an official site: ${rule.source.url}`);
  try {
    toDate(rule.source.checked_on);
    if (daysBetween(rule.source.checked_on, today) < 0) errors.push("source.checked_on is in the future");
  } catch {
    errors.push(`source.checked_on is not a real date: ${rule.source.checked_on}`);
  }
  if (rule.verified_by === "agent") {
    if (!rule.source.url) errors.push("an agent-researched rule needs a source URL");
    if (!rule.source.quote) errors.push("an agent-researched rule needs a quote from its source");
    if (rule.source.quote && rule.source.quote.split(/\s+/).length > 25) errors.push("source.quote should be a short line, not a passage");
    if (daysBetween(rule.source.checked_on, today) > MAX_AGENT_AGE_DAYS) errors.push(`checked more than ${MAX_AGENT_AGE_DAYS} days ago`);
  }

  // Fixed dates must exist (no Feb 30).
  const s = rule.schedule;
  const fixed = s.type === "every_n_years" ? [s] : s.type === "annual" ? s.dates : [];
  for (const d of fixed) {
    const probe = new Date(Date.UTC(2025, d.month - 1, d.day));
    if (probe.getUTCMonth() !== d.month - 1) errors.push(`no such date: month ${d.month} day ${d.day}`);
  }

  return errors.length ? { ok: false, id: rule.id, errors } : { ok: true, rule };
}

/** Checks a whole set: each rule, unique ids, and that `replaces` points at a real rule. */
export function checkRules(inputs: unknown[], today: string): { rules: Rule[]; problems: { id: string; errors: string[] }[] } {
  const rules: Rule[] = [];
  const problems: { id: string; errors: string[] }[] = [];
  for (const input of inputs) {
    const res = checkRule(input, today);
    if (res.ok) rules.push(res.rule);
    else problems.push({ id: res.id, errors: res.errors });
  }
  const ids = new Set<string>();
  for (const r of rules) {
    if (ids.has(r.id)) problems.push({ id: r.id, errors: ["duplicate id"] });
    ids.add(r.id);
  }
  for (const r of rules) {
    if (r.replaces && !ids.has(r.replaces)) problems.push({ id: r.id, errors: [`replaces unknown rule ${r.replaces}`] });
  }
  return { rules, problems };
}
