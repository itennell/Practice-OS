import type { ApproveResult } from "@/lib/approvals";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id: string) => UUID.test(id);

const MESSAGES = {
  not_found: { status: 404, error: "Unknown approval." },
  not_pending: { status: 409, error: "This was already decided." },
  not_editable: { status: 400, error: "This kind can't be edited." },
  bad_edit: { status: 400, error: "The edited text is empty or too long." },
} as const;

export function decisionResponse(result: ApproveResult) {
  if (result.ok) return Response.json({ approval: result.approval });
  const { status, error } = MESSAGES[result.reason];
  return Response.json({ error, approval: result.approval ?? null }, { status });
}
