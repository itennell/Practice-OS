import { AsyncLocalStorage } from "node:async_hooks";
import type { ApprovalKind } from "./approval-kinds";

// How much Aeon may do on its own (migration 012), like a coding agent's
// permission modes. Plain code, no model involved: a kind runs without her tap
// only when shouldAutoRun() says so. The clinician-only lock is a constant, not
// a setting, so no switch, chat message or MCP call can turn it off.

export { APPROVAL_MODES, MODE_INFO, isApprovalMode, type ApprovalMode } from "./approval-modes";
import { type ApprovalMode } from "./approval-modes";

/** No business associate agreement yet: nothing for a client ever runs on its own. */
export const BAA_IN_PLACE = false as const;

export type Helper = "admin" | "referrals" | "instagram" | "front_desk" | "aeon";
export type Tier = "routine" | "sensitive" | "clinician_only";

/** Every approval kind's helper box and tier. tests/approval-policy.test.ts fails if a kind is missing. */
export const KIND_POLICY: Record<ApprovalKind, { helper: Helper; tier: Tier }> = {
  consult_booking: { helper: "front_desk", tier: "routine" },
  consult_reschedule: { helper: "front_desk", tier: "routine" },
  consult_cancel: { helper: "front_desk", tier: "routine" },
  test_note: { helper: "aeon", tier: "routine" },
  aeon_action: { helper: "aeon", tier: "routine" },
  sms_reply: { helper: "front_desk", tier: "sensitive" },
  web_chat_reply: { helper: "front_desk", tier: "sensitive" },
  instagram_post: { helper: "instagram", tier: "sensitive" },
  state_rules: { helper: "admin", tier: "sensitive" },
  referral_letter: { helper: "referrals", tier: "sensitive" },
  gfe_issue: { helper: "admin", tier: "clinician_only" },
  text_consult_options: { helper: "front_desk", tier: "sensitive" },
  // What an uploaded document says changes her records only when she taps Approve, in every mode.
  file_document: { helper: "admin", tier: "clinician_only" },
};

// text_missed_callers: a missed caller gets a text with open consult times.
// book_by_text (016): a reply of 1, 2 or 3, "reschedule" or "cancel" acts on her calendar.
// send_reminders (016): a booked caller gets a text the day before.
export type FrontDeskRules = { text_missed_callers: boolean; book_by_text: boolean; send_reminders: boolean };
export const DEFAULT_FRONT_DESK_RULES: FrontDeskRules = { text_missed_callers: true, book_by_text: true, send_reminders: true };
export const FRONT_DESK_RULE_KEYS = ["text_missed_callers", "book_by_text", "send_reminders"] as const;

/** Which Front Desk rule lets each kind run on its own. */
const FRONT_DESK_RULE_FOR: Partial<Record<ApprovalKind, keyof FrontDeskRules>> = {
  sms_reply: "text_missed_callers",
  text_consult_options: "text_missed_callers",
  consult_booking: "book_by_text",
  consult_reschedule: "book_by_text",
  consult_cancel: "book_by_text",
};

/** Who is asking: Aeon in the chat or over MCP (a mode), or a helper running by its own rules. */
export type Origin = { mode: ApprovalMode } | { rule: "front_desk"; rules: FrontDeskRules };

export function shouldAutoRun(kind: ApprovalKind, origin: Origin | null | undefined): boolean {
  const policy = KIND_POLICY[kind];
  if (!policy || !origin) return false;
  if (policy.tier === "clinician_only" && !BAA_IN_PLACE) return false;
  if ("rule" in origin) {
    const rule = FRONT_DESK_RULE_FOR[kind];
    return rule !== undefined && origin.rules[rule] === true;
  }
  if (origin.mode === "manual") return false;
  if (origin.mode === "auto") return policy.tier === "routine";
  return true;
}

/** Outside agents over MCP never get Bypass. */
export function capForMcp(mode: ApprovalMode): ApprovalMode {
  return mode === "bypass" ? "auto" : mode;
}


// The origin of whatever runs inside runTool(), so queueApproval() can tell
// whether this approval may run on its own without every tool passing it along.
const origin = new AsyncLocalStorage<Origin>();

export function withOrigin<T>(o: Origin, fn: () => Promise<T>): Promise<T> {
  return origin.run(o, fn);
}

export function currentOrigin(): Origin | undefined {
  return origin.getStore();
}
