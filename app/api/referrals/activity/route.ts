import { connection } from "next/server";
import { recentReferralApprovals, recentStageMoves } from "@/lib/referrals/crm";

// Referrals › Meetings and notes: her referral letters (waiting, ready, sent, declined) and her
// stage moves from the audit log, for the day-by-day timeline. Reads only.
export async function GET() {
  await connection(); // read the database per request, never at build time
  const [approvals, moves] = await Promise.all([recentReferralApprovals(undefined, 100).catch(() => null), recentStageMoves().catch(() => null)]);
  if (!approvals || !moves) return Response.json({ error: "Couldn't read your activity." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json({ approvals, moves }, { headers: { "Cache-Control": "no-store" } });
}
