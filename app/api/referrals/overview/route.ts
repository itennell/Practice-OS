import { connection } from "next/server";
import { recentReferralApprovals } from "@/lib/referrals/crm";
import { outreachPlan } from "@/lib/referrals/plan";

// Referrals › Overview: this week's plan (follow-ups due, new people, going cold) and the
// newest referral approvals for "Latest activity". Reads only; nothing changes here.
// When the plan can't be read, it says so (503) and the tab offers Try again.
export async function GET() {
  await connection(); // read the database per request, never at build time
  const [plan, approvals] = await Promise.all([outreachPlan().catch(() => null), recentReferralApprovals().catch(() => [])]);
  if (!plan) return Response.json({ error: "Couldn't read this week's plan." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return Response.json(
    {
      follow_ups: plan.follow_ups,
      reach_out: plan.reach_out.map((r) => ({ id: r.id, name: r.name, next_step: r.next_step })),
      going_cold: plan.going_cold.map((g) => ({ id: g.id, name: g.name, label: g.label })),
      approvals,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
