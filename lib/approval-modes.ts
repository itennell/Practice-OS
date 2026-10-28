// The three modes (Manual, Auto, Bypass) and their words, safe to use in the
// browser. The rule for what runs on its own lives in lib/approval-policy.ts.

export const APPROVAL_MODES = ["manual", "auto", "bypass"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const MODE_INFO: Record<ApprovalMode, { label: string; line: string }> = {
  manual: { label: "Manual", line: "Ask me before doing anything" },
  auto: { label: "Auto", line: "Handle routine things; ask about the rest" },
  bypass: { label: "Bypass", line: "Do everything except what I hand to clients" },
};

export function isApprovalMode(v: unknown): v is ApprovalMode {
  return typeof v === "string" && (APPROVAL_MODES as readonly string[]).includes(v);
}
