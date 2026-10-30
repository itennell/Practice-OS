import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { revealBody, revealNumber } from "@/lib/frontdesk/inbox";

// "Show" on one inbox row: the caller's number, or (part "body") the full words of
// a voicemail or text. Both are masked by default; each reveal is logged.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const { id, part } = ((await request.json().catch(() => ({}))) ?? {}) as { id?: unknown; part?: unknown };
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Unknown row." }, { status: 404 });
  if (part === "body") {
    const body = await revealBody(id);
    if (body == null) return Response.json({ error: "No message on this row." }, { status: 404 });
    await audit({ actor: "clinician", action: "front_desk_message_shown", subjectType: "message", subjectId: id });
    return Response.json({ body });
  }
  const number = await revealNumber(id);
  if (!number) return Response.json({ error: "No number on this row." }, { status: 404 });
  await audit({ actor: "clinician", action: "front_desk_number_shown", subjectType: "message", subjectId: id });
  return Response.json({ number });
}
