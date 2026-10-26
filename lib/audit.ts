import type postgres from "postgres";
import { db } from "./db";

export type AuditEntry = {
  actor: "clinician" | "aeon" | "executor" | "safety" | "system";
  action: string;
  approvalId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  details?: Record<string, unknown>;
};

/** Appends one row to practice_os.audit_log (append-only by trigger). */
export async function audit(entry: AuditEntry, sql: postgres.Sql = db()): Promise<void> {
  await sql`
    insert into practice_os.audit_log (actor, action, approval_id, subject_type, subject_id, details)
    values (${entry.actor}, ${entry.action}, ${entry.approvalId ?? null}, ${entry.subjectType ?? null},
            ${entry.subjectId ?? null}, ${sql.json((entry.details ?? {}) as never)})
  `;
}
