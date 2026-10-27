import { z } from "zod";
import { audit } from "../audit";
import { db } from "../db";
import { answerSetup, type Answer } from "./answers";
import { addBusinessDays, addDays, type ISODate } from "./dates";
import { loadSavedRules } from "./researched";
import { SHIPPED_RULES } from "./rules";
import { rulesFor } from "./schedule";
import { loadFacts, practiceToday, syncCalendar } from "./store";
import { factsSchema, type Rule } from "./types";

// What agents may change through MCP: practice facts, setup answers and event
// clocks. Business facts only: there is no field for a client's name or any
// clinical detail. Every change is audited and rebuilds the calendar.

/** Facts an agent may set. State and license live on the profile and change in onboarding, not here. */
export const updatableFacts = factsSchema
  .omit({ practice_state: true, credential: true, is_sample: true, city: true })
  .extend({ city_code: z.string().regex(/^[A-Z]{2,4}$/).nullable() })
  .partial()
  .strict();
export type FactUpdate = z.infer<typeof updatableFacts>;

export async function updateFacts(update: FactUpdate, by: string) {
  const changes = updatableFacts.parse(update);
  const keys = Object.keys(changes);
  if (keys.length === 0) throw new Error("Nothing to update.");
  const sql = db();
  const [before] = await sql`select * from practice_os.compliance_facts limit 1`;
  if (!before) throw new Error("No practice facts yet. Finish onboarding first.");
  await sql`update practice_os.compliance_facts set ${sql(changes as never, keys as never)}`;
  await audit({
    actor: "aeon",
    action: "facts_updated",
    subjectType: "compliance_facts",
    details: { by, changes, before: Object.fromEntries(keys.map((k) => [k, before[k] ?? null])) },
  });
  const calendar = await syncCalendar();
  return { updated: keys, calendar_items: calendar.written, still_needed: calendar.needs_facts.map((n) => n.title) };
}

/** Rules that apply to this practice now: shipped plus her approved researched ones. */
async function liveRules(): Promise<Rule[]> {
  const facts = await loadFacts();
  if (!facts) throw new Error("No practice facts yet. Finish onboarding first.");
  return rulesFor([...SHIPPED_RULES, ...(await loadSavedRules())], facts);
}

/** The clocks she can start, for an agent to pick from. */
export async function listClocks() {
  return (await liveRules())
    .filter((r) => r.schedule.type === "clock")
    .map((r) => ({ rule_id: r.id, event: r.schedule.type === "clock" ? r.schedule.event : "", title: r.title }));
}

function clockDue(rule: Rule, happened: ISODate): ISODate {
  const s = rule.schedule;
  if (s.type !== "clock") throw new Error(`${rule.id} is not a clock.`);
  if (s.business_days !== undefined) return addBusinessDays(happened, s.business_days);
  if (s.hours !== undefined) return addDays(happened, Math.ceil(s.hours / 24));
  return addDays(happened, s.days ?? 0);
}

/** Starts a clock ("a records request came in today"). No client details are taken or stored. */
export async function logEvent(ruleId: string, happenedOn: ISODate | undefined, by: string) {
  const rule = (await liveRules()).find((r) => r.id === ruleId);
  if (!rule || rule.schedule.type !== "clock") {
    return { ok: false as const, error: `No clock called ${ruleId} applies to this practice.`, clocks: await listClocks() };
  }
  const today = await practiceToday();
  const happened = happenedOn ?? today;
  if (happened > today) return { ok: false as const, error: "That date is in the future.", clocks: [] };
  const due = clockDue(rule, happened);
  const sql = db();
  const [row] = await sql`
    insert into practice_os.obligations (
      rule_id, kind, title, category, due_on, started_on, jurisdiction, verified_by,
      lead_red_days, lead_yellow_days, what_to_do, you_must, guide_slug,
      citation, source_url, quote, last_verified_on, caveat, is_sample
    ) values (
      ${rule.id}, 'clock', ${rule.title}, ${rule.category}, ${due}, ${happened}, ${rule.jurisdiction}, ${rule.verified_by},
      ${rule.lead.red}, ${rule.lead.yellow}, ${rule.what_to_do}, ${rule.you_must}, ${rule.guide},
      ${rule.source.citation}, ${rule.source.url ?? null}, ${rule.source.quote ?? null}, ${rule.source.checked_on}, ${rule.caveat ?? null},
      (select is_sample from practice_os.compliance_facts limit 1)
    )
    on conflict (rule_id, due_on, started_on) where rule_id is not null do nothing
    returning id`;
  await audit({ actor: "aeon", action: "clock_started", subjectType: "obligation", subjectId: row?.id ?? null, details: { by, rule_id: rule.id, happened, due } });
  return { ok: true as const, rule_id: rule.id, title: rule.title, started_on: happened, due_on: due, already_logged: !row };
}

/** answer_setup by rule id (what morning_brief returns). */
export async function answerSetupByRule(ruleId: string, answer: Answer, by: string) {
  const [row] = await db()`select id from practice_os.obligations where rule_id = ${ruleId} and kind = 'setup'`;
  if (!row) return { ok: false as const, reason: "not_found" as const };
  return answerSetup(row.id, answer, by);
}

/**
 * research_state_rules: Muse researches her state (a few topics per call keeps
 * each call to a couple of minutes), and the result waits in her inbox as one
 * state_rules approval. Nothing is saved until she approves.
 */
export async function runResearch(topicIds: string[] | undefined, by: string) {
  const { TOPICS, researchTopic, topicsFor } = await import("./research");
  const { queueStateRules } = await import("./researched");
  const { CREDENTIAL_LABEL, STATES, VERIFIED_STATES } = await import("./states");
  const facts = await loadFacts();
  if (!facts) throw new Error("No practice facts yet. Finish onboarding first.");
  if (VERIFIED_STATES.has(facts.practice_state)) {
    return {
      ok: false as const,
      error: `${STATES[facts.practice_state]} rules already ship verified by the Practice-OS maintainers, so there is nothing to research.`,
    };
  }
  const unknown = (topicIds ?? []).filter((id) => !TOPICS.some((t) => t.id === id));
  if (unknown.length) return { ok: false as const, error: `Unknown topics: ${unknown.join(", ")}. Topics: ${TOPICS.map((t) => t.id).join(", ")}.` };
  const topics = topicsFor(facts.employee_count, topicIds?.length ? TOPICS.filter((t) => topicIds.includes(t.id)) : TOPICS);
  const ctx = {
    state: facts.practice_state,
    stateName: STATES[facts.practice_state] ?? facts.practice_state,
    credential: facts.credential,
    credentialLabel: CREDENTIAL_LABEL[facts.credential],
    today: await practiceToday(),
  };
  const results = [];
  for (const t of topics) results.push(await researchTopic(ctx, t));
  const approvalId = await queueStateRules(ctx, results, by);
  const tokens = results.reduce((a, r) => a + r.tokens, 0);
  await audit({ actor: "aeon", action: "state_researched", approvalId, subjectType: "state_rules", details: { by, state: ctx.state, topics: topics.map((t) => t.id), tokens } });
  return {
    ok: true as const,
    approval_id: approvalId,
    state: ctx.state,
    topics: topics.map((t) => t.id),
    rules_to_review: results.reduce((a, r) => a + r.rules.length, 0),
    dropped: results.flatMap((r) => r.dropped),
    not_found: results.flatMap((r) => r.not_found),
    tokens,
  };
}
