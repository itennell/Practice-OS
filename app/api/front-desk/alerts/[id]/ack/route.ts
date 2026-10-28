import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { acknowledgeAlert } from "@/lib/frontdesk/view";

// "I've seen this" on a Front Desk alert (crisis alerts stay pinned until then).
export async function POST(request: Request, ctx: RouteContext<"/api/front-desk/alerts/[id]/ack">) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown alert." }, { status: 404 });
  const ok = await acknowledgeAlert(id);
  if (ok) await audit({ actor: "clinician", action: "front_desk_alert_acknowledged", subjectType: "alert", subjectId: id });
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
