import { audit } from "./audit";
import { db } from "./db";
import { isDryRun } from "./env";
import { editableField, executors } from "./executors";
import type { ApprovalRow } from "./executors/types";

export type { ApprovalRow };

export type ApprovalView = Pick<
  ApprovalRow,
  "id" | "kind" | "title" | "preview" | "status" | "created_by" | "error" | "result" | "is_sample"
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
    error: row.error,
    result: row.result,
    is_sample: row.is_sample,
    created_at: new Date(row.created_at).toISOString(),
    decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    editable: field && typeof value === "string" ? { field, value } : null,
  };
}

/** Pending first, then the most recent decisions. */
export async function listApprovals(opts: { includeDecided?: boolean; limit?: number } = {}) {
  const limit = opts.limit ?? 50;
  const rows = opts.includeDecided
    ? await db()<ApprovalRow[]>`
        select * from practice_os.approvals
        order by (status = 'pending') desc, (status = 'running') desc, coalesce(decided_at, created_at) desc
        limit ${limit}`
    : await db()<ApprovalRow[]>`
        select * from practice_os.approvals
        where status in ('pending', 'running') or decided_at > now() - interval '1 day'
        order by (status = 'pending') desc, (status = 'running') desc, coalesce(decided_at, created_at) desc
        limit ${limit}`;
  return rows.map(toView);
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
export async function approve(id: string, opts: { by: string; edit?: string }): Promise<ApproveResult> {
  const before = await getRow(id);
  if (!before) return { ok: false, reason: "not_found" };

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
    actor: "clinician",
    action: editedPayload ? "approval_edited_and_approved" : "approval_approved",
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
