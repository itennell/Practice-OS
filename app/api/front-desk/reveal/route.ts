import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { revealNumber } from "@/lib/frontdesk/inbox";

// "Show number" on one inbox row. Numbers are masked by default; each reveal is logged.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { id } = ((await request.json().catch(() => ({}))) ?? {}) as { id?: unknown };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown row." }, { status: 404 });
  const number = await revealNumber(id);
  if (!number) return Response.json({ error: "No number on this row." }, { status: 404 });
  await audit({ actor: "clinician", action: "front_desk_number_shown", subjectType: "message", subjectId: id });
  return Response.json({ number });
}
