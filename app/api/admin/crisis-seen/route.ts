import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { isLocalAppRequest } from "@/lib/request-guard";

// She pressed "I checked" on the crisis item at the top of Admin: she has looked at her
// chat. audit_log is append-only, so this adds one crisis_alert_seen row, and Admin
// (lib/admin/load.ts) ignores failures at or before it. A new failure shows again.
// Only on her own computer, from the app's own page: refused on the view-only Vercel copy.
export async function POST(request: Request) {
  if (!canDecide(request) || !isLocalAppRequest(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  await audit({ actor: "clinician", action: "crisis_alert_seen", subjectType: "admin", details: { by: "admin" } });
  return Response.json({ ok: true });
}
