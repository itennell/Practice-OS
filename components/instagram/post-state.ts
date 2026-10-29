// Where a post stands, in one place: the card's label and the board's counts
// ("1 waiting for you · 2 ready to post") both come from postState, so they agree.
import type { PostView } from "@/lib/instagram/store";
import type { Status } from "../shared/status-mark";

export type PostState = "ready" | "posted" | "blocked" | "waiting" | "working" | "declined" | "draft" | "retry";

/** One answer per post: the card's label and the header's counts both come from here. */
export function postState(p: Pick<PostView, "status" | "approvalStatus" | "approvalId">): PostState {
  if (p.status === "published") return "posted";
  if (p.status === "ready") return "ready";
  if (p.status === "blocked") return "blocked";
  if (p.approvalStatus === "pending" && p.approvalId) return "waiting";
  if (p.approvalStatus === "running") return "working";
  if (p.approvalStatus === "rejected") return "declined";
  // Written but not sent to her approvals yet.
  if (p.status === "draft") return "draft";
  // Failed, or a draft that never reached her approvals: she can retry it.
  return "retry";
}

export const STATE: Record<PostState, { status: Status; label: string }> = {
  ready: { status: "done", label: "Ready to post" },
  posted: { status: "done", label: "Posted" },
  blocked: { status: "declined", label: "Blocked" },
  waiting: { status: "pending", label: "Waiting for you" },
  working: { status: "running", label: "Working…" },
  declined: { status: "declined", label: "Declined" },
  draft: { status: "declined", label: "Draft" },
  retry: { status: "failed", label: "Didn't finish" },
};
