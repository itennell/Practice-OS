import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { isLocalAppRequest } from "@/lib/request-guard";

// She pressed "I checked" on the crisis item at the top of Admin: she has looked at her
// chat. The button sends the item she saw (urgent_alert:<audit id>). audit_log is
// append-only, so this adds one crisis_alert_seen row naming that failure, and Admin
// (lib/admin/load.ts) hides failures at or before it; one logged after her page loaded stays.
// Only on her own computer, from the app's own page: refused on the view-only Vercel copy.
const Body = z.object({ item: z.string().regex(/^urgent_alert:\d{1,18}$/) }).strict();

export async function POST(request: Request) {
  if (!canDecide(request) || !isLocalAppRequest(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Unknown item." }, { status: 400 });
  const id = parsed.data.item.slice("urgent_alert:".length);
  const [row] = await db()`select id::text as id from practice_os.audit_log where id::text = ${id} and action = 'crisis_alert_failed'`;
  if (!row) return Response.json({ error: "Unknown item." }, { status: 404 });
  await audit({ actor: "clinician", action: "crisis_alert_seen", subjectType: "admin", details: { through_id: row.id } });
  return Response.json({ ok: true });
}
