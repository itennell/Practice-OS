import { audit } from "./audit";
import { db } from "./db";
import { isDryRun } from "./env";
import { demoApprovalShown, REFERRAL_DEMO_APPROVAL_KINDS, REFERRAL_DEMO_TOOLS, REFERRALS_ONLY_DEMO } from "./features";
import { editableField, executors } from "./executors";
import { APPROVAL_KINDS, type ApprovalKind } from "./approval-kinds";
import { currentOrigin, shouldAutoRun } from "./approval-policy";
import type { ApprovalRow } from "./executors/types";

export type { ApprovalRow };

export type ApprovalView = Pick<
  ApprovalRow,
  "id" | "kind" | "title" | "preview" | "status" | "created_by" | "decided_by" | "error" | "result" | "is_sample"
> & {
  created_at: string;
  decided_at: string | null;
  editable: { field: string; value: string } | null;
};

export function toView(row: ApprovalRow): ApprovalView {
  const field = editableField[row.kind];
  const value = field ? row.payload[field] : undefined;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    preview: row.preview,
    status: row.status,
    created_by: row.created_by,
    decided_by: row.decided_by,
    error: row.error,
    result: row.result,
    is_sample: row.is_sample,
    created_at: new Date(row.created_at).toISOString(),
    decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    editable: field && typeof value === "string" ? { field, value } : null,
  };
}

/**
 * In the referrals-only demo (lib/features.ts) only referral approvals show: referral letters
 * and Aeon actions that wrap a referral tool.
 *
 * Rows of kinds the app no longer has (the removed Media and Front Desk helpers) never show.
 */
export const visibleKind = () =>
  db()`kind = any(${db().array([...APPROVAL_KINDS])})
       and (${!REFERRALS_ONLY_DEMO} or kind = any(${db().array([...REFERRAL_DEMO_APPROVAL_KINDS])})
            or (kind = 'aeon_action' and payload ->> 'tool' = any(${db().array([...REFERRAL_DEMO_TOOLS])})))`;

/** Pending first, then the most recent decisions. */
export async function listApprovals(opts: { includeDecided?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const rows = opts.includeDecided
    ? await db()<ApprovalRow[]>`
        select * from practice_os.approvals
        where ${visibleKind()}
        order by (status = 'pending') desc, (status = 'running') desc, coalesce(decided_at, created_at) desc
        limit ${limit}`
    : await db()<ApprovalRow[]>`
        select * from practice_os.approvals
        where (status in ('pending', 'running') or decided_at > now() - interval '1 day') and ${visibleKind()}
        order by (status = 'pending') desc, (status = 'running') desc, coalesce(decided_at, created_at) desc
        limit ${limit}`;
  return rows.map(toView);
}

/** These approvals, in the order given (for the approval cards inside Aeon's chat). */
export async function listApprovalsById(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db()<ApprovalRow[]>`select * from practice_os.approvals where id in ${db()(ids)}`;
  const byId = new Map(rows.filter((r) => !hiddenRow(r)).map((r) => [r.id, toView(r)]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/** A kind the app no longer has (the removed Media and Front Desk helpers): never listed, queued, approved or declined. */
const removedKind = (kind: string) => !(APPROVAL_KINDS as readonly string[]).includes(kind);

/** Hidden from her: a removed kind, or one outside the referrals-only demo (lib/features.ts). Never listed, approved or declined. */
const hiddenRow = (r: Pick<ApprovalRow, "kind" | "payload">) => removedKind(r.kind) || !demoApprovalShown(r.kind, r.payload?.tool);

function refuseRemoved(kind: string): void {
  if (removedKind(kind)) throw new Error(`Practice-OS has no ${kind} approvals.`);
}

export type ApproveResult =
  | { ok: true; approval: ApprovalView }
  | { ok: false; reason: "not_pending" | "not_found" | "not_editable" | "bad_edit"; approval?: ApprovalView };

async function getRow(id: string) {
  const [row] = await db()<ApprovalRow[]>`select * from practice_os.approvals where id = ${id}`;
  return row ?? null;
}

/**
 * Claims a pending approval atomically, runs its executor and records the
 * outcome. `edit` replaces the one editable payload field before running.
 */
export async function approve(id: string, opts: { by: string; edit?: string; auto?: boolean }): Promise<ApproveResult> {
  const before = await getRow(id);
  if (!before || hiddenRow(before)) return { ok: false, reason: "not_found" };

  let editedPayload: Record<string, unknown> | null = null;
  if (opts.edit !== undefined) {
    const field = editableField[before.kind];
    if (!field) return { ok: false, reason: "not_editable", approval: toView(before) };
    if (opts.edit.trim() === "" || opts.edit.length > 5000) {
      return { ok: false, reason: "bad_edit", approval: toView(before) };
    }
    editedPayload = { ...before.payload, [field]: opts.edit };
  }

  const [row] = await db()<ApprovalRow[]>`
    update practice_os.approvals
       set status = 'running', decided_at = now(), decided_by = ${opts.by},
           payload = coalesce(${editedPayload ? db().json(editedPayload as never) : null}::jsonb, payload)
     where id = ${id} and status = 'pending'
    returning *`;
  if (!row) return { ok: false, reason: "not_pending", approval: toView((await getRow(id))!) };

  await audit({
    actor: opts.auto ? "aeon" : "clinician",
    action: opts.auto ? "approval_auto_run" : editedPayload ? "approval_edited_and_approved" : "approval_approved",
    approvalId: row.id,
    subjectType: row.kind,
    details: editedPayload ? { before: before.payload, after: editedPayload, by: opts.by } : { by: opts.by },
  });

  const executor = executors[row.kind];
  let finished: ApprovalRow;
  try {
    if (!executor) throw new Error(`No executor for ${row.kind} yet.`);
    const result = await executor(row, { dryRun: isDryRun() });
    [finished] = await db()<ApprovalRow[]>`
      update practice_os.approvals set status = 'done', result = ${db().json(result as never)}
      where id = ${row.id} returning *`;
    await audit({ actor: "executor", action: "approval_done", approvalId: row.id, subjectType: row.kind, details: { result } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    [finished] = await db()<ApprovalRow[]>`
      update practice_os.approvals set status = 'failed', error = ${message}
      where id = ${row.id} returning *`;
    await audit({ actor: "executor", action: "approval_failed", approvalId: row.id, subjectType: row.kind, details: { error: message } });
  }
  return { ok: true, approval: toView(finished!) };
}

export async function decline(id: string, opts: { by: string }): Promise<ApproveResult> {
  const current = await getRow(id);
  if (current && hiddenRow(current)) return { ok: false, reason: "not_found" };
  const [row] = await db()<ApprovalRow[]>`
    update practice_os.approvals
       set status = 'rejected', decided_at = now(), decided_by = ${opts.by}
     where id = ${id} and status = 'pending'
    returning *`;
  if (!row) {
    const current = await getRow(id);
    return current ? { ok: false, reason: "not_pending", approval: toView(current) } : { ok: false, reason: "not_found" };
  }
  await audit({ actor: "clinician", action: "approval_declined", approvalId: row.id, subjectType: row.kind, details: { by: opts.by } });
  return { ok: true, approval: toView(row) };
}

/**
 * The only way agents and tools add work (AGENTS.md > Approvals): one INSERT
 * with status 'pending' and an audit line. It runs the executor right away only
 * when the mode or helper rule it was queued under allows that kind
 * (lib/approval-policy.ts); decided_by then says "auto:<mode>".
 */
export async function queueApproval(input: {
  kind: ApprovalKind;
  title: string;
  preview?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  createdBy: string;
}): Promise<string> {
  refuseRemoved(input.kind);
  const [row] = await db()<{ id: string }[]>`
    insert into practice_os.approvals (kind, title, preview, payload, status, created_by)
    values (${input.kind}, ${input.title}, ${db().json((input.preview ?? {}) as never)},
            ${db().json((input.payload ?? {}) as never)}, 'pending', ${input.createdBy})
    returning id`;
  await finishQueuedApproval(row.id, input);
  return row.id;
}

async function finishQueuedApproval(
  id: string,
  input: { kind: ApprovalKind; title: string; createdBy: string },
): Promise<void> {
  await audit({
    actor: "aeon",
    action: "approval_queued",
    approvalId: id,
    subjectType: input.kind,
    details: { created_by: input.createdBy, title: input.title },
  });
  const origin = currentOrigin();
  if (shouldAutoRun(input.kind, origin)) {
    await approve(id, { by: `auto:${origin?.mode}`, auto: true });
  }
}

/**
 * Queues at most one pending/running approval for the same payload value. The
 * transaction lock makes two simultaneous public requests take turns without
 * requiring a new database index or migration.
 */
export async function queueApprovalOnce(
  input: {
    kind: ApprovalKind;
    title: string;
    preview?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    createdBy: string;
  },
  dedupe: { payloadField: string; value: string },
  /** The statuses that count as the same approval still open. */
  open: readonly ("pending" | "running")[] = ["pending", "running"],
): Promise<{ id: string; created: boolean }> {
  refuseRemoved(input.kind);
  const result = (await db().begin(async (sql) => {
    await sql`select pg_advisory_xact_lock(hashtext(${`${input.kind}:${dedupe.payloadField}:${dedupe.value}`}))`;
    const [existing] = await sql<{ id: string }[]>`
      select id from practice_os.approvals
      where kind = ${input.kind} and status in ${sql(open as string[])}
        and payload ->> ${dedupe.payloadField} = ${dedupe.value}
      order by created_at desc limit 1`;
    if (existing) return { id: existing.id, created: false };
    const [row] = await sql<{ id: string }[]>`
      insert into practice_os.approvals (kind, title, preview, payload, status, created_by)
      values (${input.kind}, ${input.title}, ${sql.json((input.preview ?? {}) as never)},
              ${sql.json((input.payload ?? {}) as never)}, 'pending', ${input.createdBy})
      returning id`;
    return { id: row.id, created: true };
  })) as { id: string; created: boolean };
  if (result.created) await finishQueuedApproval(result.id, input);
  return result;
}

/**
 * What really happened to an approval a tool just queued. In Auto or Bypass the
 * kind may have run on its own inside queueApproval (finishQueuedApproval), so a
 * tool never says "waiting for your OK" without reading this first.
 */
export type ApprovalOutcome = {
  approval_id: string;
  status: ApprovalRow["status"];
  /** True only while it waits for her tap. */
  waiting_for_her: boolean;
  /** It ran without her tap, under her mode (decided_by "auto:<mode>"). */
  ran_on_its_own: boolean;
  /** The executor's own note ("… is on your Referrals calendar for …"), when it ran. */
  result_note: string | null;
  error: string | null;
};

export function outcomeOfRow(r: Pick<ApprovalRow, "id" | "status" | "decided_by" | "result" | "error">): ApprovalOutcome {
  const note = typeof r.result?.note === "string" ? r.result.note : null;
  return {
    approval_id: r.id,
    status: r.status,
    waiting_for_her: r.status === "pending",
    ran_on_its_own: Boolean(r.decided_by?.startsWith("auto:")),
    result_note: note ? note.slice(0, 300) : null,
    error: r.error ? String(r.error).slice(0, 300) : null,
  };
}

/** The outcomes of these approvals, in the order given (missing ids left out). */
export async function approvalOutcomes(ids: string[]): Promise<ApprovalOutcome[]> {
  if (!ids.length) return [];
  const rows = await db()<Pick<ApprovalRow, "id" | "status" | "decided_by" | "result" | "error">[]>`
    select id, status, decided_by, result, error from practice_os.approvals where id in ${db()(ids)}`;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [outcomeOfRow(r)] : [];
  });
}

export async function approvalOutcome(id: string): Promise<ApprovalOutcome | null> {
  return (await approvalOutcomes([id]))[0] ?? null;
}
