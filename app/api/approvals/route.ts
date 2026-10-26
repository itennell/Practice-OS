import { listApprovals } from "@/lib/approvals";

// Live status for the inbox. Always fresh: it reads the database per request.
export async function GET(request: Request) {
  const all = new URL(request.url).searchParams.get("all") === "1";
  const approvals = await listApprovals({ includeDecided: all });
  return Response.json({ approvals }, { headers: { "Cache-Control": "no-store" } });
}
