import type postgres from "postgres";
import { DEFAULT_FRONT_DESK_RULES, isApprovalMode, type ApprovalMode, type FrontDeskRules } from "./approval-policy";
import { audit } from "./audit";
import { db } from "./db";

// Where the modes are kept (migration 012): the default on settings, a chat's own
// pick on its conversation row, and Front Desk's standing rules.

export async function loadApprovalSettings(sql: postgres.Sql = db()): Promise<{ mode: ApprovalMode; frontDesk: FrontDeskRules }> {
  const [row] = await sql`select approval_mode, front_desk_rules from practice_os.settings limit 1`.catch(() => []);
  const fd = row?.front_desk_rules as Partial<FrontDeskRules> | undefined;
  return {
    mode: isApprovalMode(row?.approval_mode) ? row.approval_mode : "auto",
    frontDesk: { ...DEFAULT_FRONT_DESK_RULES, ...(typeof fd?.text_missed_callers === "boolean" ? { text_missed_callers: fd.text_missed_callers } : {}) },
  };
}

export async function saveDefaultMode(mode: ApprovalMode, by: string, sql: postgres.Sql = db()): Promise<void> {
  if (!isApprovalMode(mode)) throw new Error("Pick Manual, Auto or Bypass.");
  await sql`update practice_os.settings set approval_mode = ${mode}`;
  await audit({ actor: "clinician", action: "approval_mode_default_set", subjectType: "settings", details: { by, mode } }, sql);
}

export async function saveFrontDeskRules(rules: FrontDeskRules, by: string, sql: postgres.Sql = db()): Promise<void> {
  if (typeof rules.text_missed_callers !== "boolean") throw new Error("text_missed_callers must be on or off.");
  await sql`update practice_os.settings set front_desk_rules = ${sql.json({ text_missed_callers: rules.text_missed_callers } as never)}`;
  await audit({ actor: "clinician", action: "front_desk_rules_set", subjectType: "settings", details: { by, ...rules } }, sql);
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
