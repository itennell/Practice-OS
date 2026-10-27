import { listApprovals, listApprovalsById } from "@/lib/approvals";
import { isUuid } from "./responses";

// Live status for the inbox. Always fresh: it reads the database per request.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  // ?ids=a,b: just these, whatever their status (the approval cards inside Aeon's chat).
  const ids = params.get("ids")?.split(",").filter(isUuid).slice(0, 20);
  if (ids) return Response.json({ approvals: await listApprovalsById(ids) }, { headers: { "Cache-Control": "no-store" } });
  const all = params.get("all") === "1";
  const approvals = await listApprovals({ includeDecided: all });
  return Response.json({ approvals }, { headers: { "Cache-Control": "no-store" } });
}
