import { connection } from "next/server";
import { db } from "@/lib/db";
import { outreachPlan } from "@/lib/referrals/plan";
import type { ApprovalBits } from "@/lib/referrals/crm-views";

// Referrals › Overview: this week's plan (follow-ups due, new people, going cold) and the
// newest referral approvals for "Latest activity". Reads only; nothing changes here.
export async function GET() {
  await connection(); // read the database per request, never at build time
  const [plan, approvals] = await Promise.all([
    outreachPlan().catch(() => null),
    db()<ApprovalBits[]>`
      select id, kind, title, status, created_at::text as created_at, decided_at::text as decided_at
        from practice_os.approvals
       where kind like 'referral%'
       order by coalesce(decided_at, created_at) desc
       limit 8`.catch(() => [] as ApprovalBits[]),
  ]);
  return Response.json(
    {
      follow_ups: plan?.follow_ups ?? [],
      reach_out: plan?.reach_out.map((r) => ({ id: r.id, name: r.name, next_step: r.next_step })) ?? [],
      going_cold: plan?.going_cold.map((g) => ({ id: g.id, name: g.name, label: g.label })) ?? [],
      approvals: [...approvals],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
