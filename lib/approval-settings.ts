import type postgres from "postgres";
import { isApprovalMode, type ApprovalMode } from "./approval-policy";
import { audit } from "./audit";
import { db } from "./db";

// Where the modes are kept (migration 012): the default on settings and a chat's own
// pick on its conversation row.

export async function loadApprovalSettings(sql: postgres.Sql = db()): Promise<{ mode: ApprovalMode }> {
  const [row] = await sql`select approval_mode from practice_os.settings limit 1`.catch(() => []);
  return { mode: isApprovalMode(row?.approval_mode) ? row.approval_mode : "auto" };
}

export async function saveDefaultMode(mode: ApprovalMode, by: string, sql: postgres.Sql = db()): Promise<void> {
  if (!isApprovalMode(mode)) throw new Error("Pick Manual, Auto or Bypass.");
  await sql`update practice_os.settings set approval_mode = ${mode}`;
  await audit({ actor: "clinician", action: "approval_mode_default_set", subjectType: "settings", details: { by, mode } }, sql);
}

/** A chat's own mode, or null when it follows the default. */
export async function conversationMode(id: string, sql: postgres.Sql = db()): Promise<ApprovalMode | null> {
  const [row] = await sql`select approval_mode from practice_os.conversations where id = ${id}`;
  return isApprovalMode(row?.approval_mode) ? row.approval_mode : null;
}

export async function saveConversationMode(id: string, mode: ApprovalMode, by: string, sql: postgres.Sql = db()): Promise<boolean> {
  if (!isApprovalMode(mode)) throw new Error("Pick Manual, Auto or Bypass.");
  const rows = await sql`update practice_os.conversations set approval_mode = ${mode} where id = ${id} returning id`;
  if (rows.length) await audit({ actor: "clinician", action: "approval_mode_set", subjectType: "conversation", subjectId: id, details: { by, mode } }, sql);
  return rows.length > 0;
}
