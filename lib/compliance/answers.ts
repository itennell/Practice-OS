import { audit } from "../audit";
import { db } from "../db";
import { addDays } from "./dates";
import { SHIPPED_RULES } from "./rules";
import { practiceToday } from "./store";
import type { ObligationView } from "./view";

// Her answer to a "Did you set this up?" reminder. Saved on the obligation row
// (so a calendar rebuild keeps it) and in audit_log; next_ask_on is when Aeon
// asks again.

export const ANSWERS = ["done", "not_yet", "not_applicable"] as const;
export type Answer = (typeof ANSWERS)[number];

/** Not yet: ask again in 30 days. Done: after the rule's re-ask period. Doesn't apply: in a year. */
const NOT_YET_DAYS = 30;
const NOT_APPLICABLE_DAYS = 365;

export type AnswerResult = { ok: true; id: string; status: Answer; next_ask_on: string } | { ok: false; reason: "not_found" | "not_setup" };

export async function answerSetup(id: string, answer: Answer, by = "clinician"): Promise<AnswerResult> {
  const sql = db();
  const [row] = await sql<Pick<ObligationView, "rule_id" | "kind" | "title">[]>`
    select rule_id, kind, title from practice_os.obligations where id = ${id}`;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.kind !== "setup") return { ok: false, reason: "not_setup" };

  const today = await practiceToday(sql);
  const rule = SHIPPED_RULES.find((r) => r.id === row.rule_id);
  const reask = rule?.schedule.type === "setup" ? rule.schedule.reask_days : NOT_APPLICABLE_DAYS;
  const days = answer === "done" ? reask : answer === "not_yet" ? NOT_YET_DAYS : NOT_APPLICABLE_DAYS;
  const nextAsk = addDays(today, days);

  await sql.begin(async (tx) => {
    await tx`
      update practice_os.obligations
      set status = ${answer}, answered_on = ${today}, next_ask_on = ${nextAsk},
          completed_at = ${answer === "done" ? new Date() : null}
      where id = ${id}`;
    await audit(
      {
        actor: "clinician",
        action: "obligation.answered",
        subjectType: "obligation",
        subjectId: id,
        details: { rule_id: row.rule_id, title: row.title, answer, next_ask_on: nextAsk, by },
      },
      tx as never,
    );
  });
  return { ok: true, id, status: answer, next_ask_on: nextAsk };
}
