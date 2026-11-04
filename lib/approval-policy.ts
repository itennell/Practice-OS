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

export type Helper = "admin" | "referrals" | "aeon";
export type Tier = "routine" | "sensitive" | "clinician_only";

/** Every approval kind's helper box and tier. tests/approval-policy.test.ts fails if a kind is missing. */
export const KIND_POLICY: Record<ApprovalKind, { helper: Helper; tier: Tier }> = {
  test_note: { helper: "aeon", tier: "routine" },
  aeon_action: { helper: "aeon", tier: "routine" },
  state_rules: { helper: "admin", tier: "sensitive" },
  referral_letter: { helper: "referrals", tier: "sensitive" },
  gfe_issue: { helper: "admin", tier: "clinician_only" },
  // What an uploaded document says changes her records only when she taps Approve, in every mode.
  file_document: { helper: "admin", tier: "clinician_only" },
  // A meeting Aeon planned goes on her Referrals calendar; nothing is sent.
  referral_meeting: { helper: "referrals", tier: "sensitive" },
};

/** Who is asking: Aeon in the chat or over MCP, in a mode. */
export type Origin = { mode: ApprovalMode };

export function shouldAutoRun(kind: ApprovalKind, origin: Origin | null | undefined): boolean {
  const policy = KIND_POLICY[kind];
  if (!policy || !origin) return false;
  if (policy.tier === "clinician_only" && !BAA_IN_PLACE) return false;
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
