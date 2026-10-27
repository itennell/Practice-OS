import type postgres from "postgres";
import { audit } from "../audit";
import { db } from "../db";
import { formatBriefDate } from "./format";
import type { ResearchContext, TopicResult } from "./research";
import { SHIPPED_RULES } from "./rules";
import { ruleSchema, type Rule } from "./types";
import { checkRule } from "./validate";

// Rules Muse researched for her state: queued as one state_rules approval,
// saved to practice_os.compliance_rules when she approves, and shown with a
// "please confirm" badge until she confirms each one. Shipped rules (federal,
// Illinois) never live here and are never replaced by research.

const SHIPPED_IDS = new Set(SHIPPED_RULES.map((r) => r.id));

export type Evidence = { url: string; quote: string; level: "cited" | "page"; page_check: string };
export type StateRulesPayload = {
  state: string;
  credential: string;
  rules: Rule[];
  evidence: Record<string, Evidence>;
  dropped: { title: string; reasons: string[] }[];
  not_found: string[];
  cost: { calls: number; tokens: number };
};

function describe(rule: Rule): string {
  const s = rule.schedule;
  switch (s.type) {
    case "every_n_years":
      return `${formatBriefDate(`2026-${String(s.month).padStart(2, "0")}-${String(s.day).padStart(2, "0")}`).replace(/^\w+, /, "")}, every ${s.n} years`;
    case "annual":
      return s.dates.map((d) => `${d.month}/${d.day}`).join(", ") + " each year";
    case "after_fact":
      return s.fact === "license_expires_on" ? `on your license expiration date, every ${s.months / 12} years` : `after ${s.fact.replaceAll("_", " ")}`;
    case "clock":
      return `within ${s.days ?? s.business_days ?? s.hours} ${s.days !== undefined ? "days" : s.business_days !== undefined ? "business days" : "hours"} of: ${s.event}`;
    case "setup":
      return "set up once, reviewed later";
    default:
      return "good to know";
  }
}

/** One approval for a research run. Rules that would replace a shipped rule are left out. */
export async function queueStateRules(c: ResearchContext, results: TopicResult[], createdBy: string): Promise<string | null> {
  const rules: Rule[] = [];
  const evidence: Record<string, Evidence> = {};
  const dropped = results.flatMap((r) => r.dropped);
  for (const r of results) {
    for (const rule of r.rules) {
      if (SHIPPED_IDS.has(rule.id) || rules.some((x) => x.id === rule.id)) {
        dropped.push({ title: rule.title, reasons: ["a rule with this id already exists"] });
        continue;
      }
      rules.push(rule);
      const page = r.page_checks.find((p) => p.rule_id === rule.id);
      evidence[rule.id] = {
        url: rule.source.url ?? "",
        quote: rule.source.quote ?? "",
        level: rule.source.evidence ?? "cited",
        page_check: page ? `${page.result}: ${page.detail}` : "not checked",
      };
    }
  }
  if (rules.length === 0) return null;
  const cost = results.reduce((a, r) => ({ calls: a.calls + r.calls, tokens: a.tokens + r.tokens }), { calls: 0, tokens: 0 });
  const payload: StateRulesPayload = {
    state: c.state,
    credential: c.credential,
    rules,
    evidence,
    dropped,
    not_found: results.flatMap((r) => r.not_found),
    cost,
  };
  const confirmed = rules.filter((r) => r.source.evidence === "page").length;
  // Imported here: approvals -> executors -> state_rules -> store -> this file would be a cycle at load time.
  const { queueApproval } = await import("../approvals");
  return queueApproval({
    kind: "state_rules",
    title: `${rules.length} ${c.stateName} rules for your ${c.credential} license to review`,
    preview: {
      body:
        `Aeon researched ${c.stateName} on official sites. ${confirmed} of ${rules.length} quotes were confirmed on the page itself. ` +
        `Approving adds them to Deadlines, each marked "please confirm with your board".`,
      rules: rules.map((r) => ({ title: r.title, when: describe(r), source: r.source.url, evidence: r.source.evidence })),
      dropped: dropped.length,
      tokens: cost.tokens,
    },
    payload: payload as unknown as Record<string, unknown>,
    createdBy,
  });
}

/** The executor's work: re-check every rule, save it, return what was saved. */
export async function saveStateRules(approvalId: string, payload: StateRulesPayload, today: string, sql: postgres.Sql = db()) {
  const saved: string[] = [];
  const refused: { id: string; errors: string[] }[] = [];
  for (const raw of payload.rules) {
    // The payload sat in the inbox: check it again, as if Muse had just sent it.
    const checked = checkRule(raw, today);
    if (!checked.ok) {
      refused.push({ id: checked.id, errors: checked.errors });
      continue;
    }
    const rule = checked.rule;
    if (rule.verified_by !== "agent" || rule.jurisdiction === "US" || SHIPPED_IDS.has(rule.id)) {
      refused.push({ id: rule.id, errors: ["not a researched state rule"] });
      continue;
    }
    const ev = payload.evidence[rule.id];
    await sql`
      insert into practice_os.compliance_rules (id, jurisdiction, rule, evidence_level, evidence, approval_id)
      values (${rule.id}, ${rule.jurisdiction}, ${sql.json(rule as never)}, ${rule.source.evidence ?? "cited"},
              ${sql.json((ev ?? {}) as never)}, ${approvalId})
      on conflict (id) do update set
        rule = excluded.rule, jurisdiction = excluded.jurisdiction, evidence_level = excluded.evidence_level,
        evidence = excluded.evidence, approval_id = excluded.approval_id, status = 'active',
        verified_by = 'agent', confirmed_at = null, researched_at = now(), checked_at = now()`;
    saved.push(rule.id);
  }
  return { saved, refused };
}

/** Saved researched rules, ready to join the shipped ones in the calendar. */
export async function loadSavedRules(sql: postgres.Sql = db()): Promise<Rule[]> {
  const rows = await sql`
    select rule, verified_by, evidence_level from practice_os.compliance_rules where status <> 'retired' order by id`;
  return rows.map((r) => {
    const rule = ruleSchema.parse(r.rule);
    rule.verified_by = r.verified_by;
    rule.source.evidence = r.evidence_level;
    return rule;
  });
}

export type ConfirmResult = { ok: true; rule_id: string } | { ok: false; reason: "not_found" | "not_researched" | "already_confirmed" };

/** She checked it with her board: the rule is now hers ("clinician"), and the badge goes away. */
export async function confirmRule(ruleId: string, by = "clinician", sql: postgres.Sql = db()): Promise<ConfirmResult> {
  const [row] = await sql`select verified_by from practice_os.compliance_rules where id = ${ruleId}`;
  if (!row) return { ok: false, reason: SHIPPED_IDS.has(ruleId) ? "not_researched" : "not_found" };
  if (row.verified_by === "clinician") return { ok: false, reason: "already_confirmed" };
  await sql.begin(async (tx) => {
    await tx`update practice_os.compliance_rules set verified_by = 'clinician', confirmed_at = now() where id = ${ruleId}`;
    await tx`update practice_os.obligations set verified_by = 'clinician' where rule_id = ${ruleId}`;
    await audit({ actor: "clinician", action: "rule_confirmed", subjectType: "compliance_rule", subjectId: ruleId, details: { by } }, tx as never);
  });
  return { ok: true, rule_id: ruleId };
}
