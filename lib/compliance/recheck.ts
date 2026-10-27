import { audit } from "../audit";
import { db } from "../db";
import { searchGrounded, type GroundedAnswer } from "../meta";
import { quoteOnPage } from "./page-check";
import { quoteInCitations } from "./research";
import { syncCalendar } from "./store";

// Quarterly re-check of the rules Muse researched (shipped federal and Illinois
// rules are re-checked by maintainers only, and never live in compliance_rules).
// First we read the source page ourselves (free). Only when the page can't be
// read do we ask Muse to find the quote again on that page with web search.

export const RECHECK_EVERY_DAYS = 91;

export type RecheckOutcome = { rule_id: string; result: "still_there" | "gone" | "couldnt_check"; how: "page" | "muse"; detail: string };

type Row = { id: string; rule: { title: string; source: { url?: string; quote?: string } } };

async function askMuse(row: Row): Promise<{ answer: GroundedAnswer; tokens: number }> {
  const { url, quote } = row.rule.source;
  const { answer } = await searchGrounded(
    "recheck",
    `Does the official page ${url} still say this, word for word: "${quote}"? Open that page, quote the matching sentence exactly in quotation marks and cite it. If it no longer says it, say so.`,
    { context: "low", effort: "low" },
  );
  return { answer, tokens: answer.tokens ?? 0 };
}

/** Re-checks researched rules due for a check (or all, with force). Returns one outcome per rule. */
export async function recheckRules(opts: { force?: boolean; limit?: number; by: string }) {
  const sql = db();
  const rows = await sql<Row[]>`
    select id, rule from practice_os.compliance_rules
    where status <> 'retired'
      and (${opts.force ?? false} or checked_at < now() - make_interval(days => ${RECHECK_EVERY_DAYS}))
    order by checked_at
    limit ${opts.limit ?? 20}`;
  const outcomes: RecheckOutcome[] = [];
  let tokens = 0;
  for (const row of rows) {
    const { url, quote } = row.rule.source;
    if (!url || !quote) {
      outcomes.push({ rule_id: row.id, result: "couldnt_check", how: "page", detail: "no source quote saved" });
      continue;
    }
    const page = await quoteOnPage(url, quote);
    let outcome: RecheckOutcome;
    if (page.result === "on_page") outcome = { rule_id: row.id, result: "still_there", how: "page", detail: page.detail };
    else if (page.result === "not_on_page") outcome = { rule_id: row.id, result: "gone", how: "page", detail: page.detail };
    else {
      const muse = await askMuse(row);
      tokens += muse.tokens;
      outcome = quoteInCitations(row.rule, muse.answer)
        ? { rule_id: row.id, result: "still_there", how: "muse", detail: "Muse quoted it again from the same page" }
        : { rule_id: row.id, result: "couldnt_check", how: "muse", detail: `page ${page.detail}; Muse did not quote it from that page` };
    }
    outcomes.push(outcome);
    // Still there: checked now and active. Gone: flagged for her and Aeon. Couldn't check: flagged too, so nothing silently ages.
    await sql`
      update practice_os.compliance_rules
      set checked_at = now(), status = ${outcome.result === "still_there" ? "active" : "needs_recheck"}
      where id = ${row.id}`;
  }
  if (outcomes.length) {
    await audit({ actor: "aeon", action: "rules_rechecked", subjectType: "compliance_rules", details: { by: opts.by, outcomes, tokens } });
    await syncCalendar();
  }
  return { checked: outcomes.length, outcomes, tokens };
}
