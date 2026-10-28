import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { APPROVAL_MODES } from "@/lib/approval-policy";
import { saveDefaultMode } from "@/lib/approval-settings";

// Settings > How Aeon works in chat: the default mode for new chats and outside agents.
export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = z.object({ mode: z.enum(APPROVAL_MODES) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick Manual, Auto or Bypass." }, { status: 400 });
  await saveDefaultMode(parsed.data.mode, "clinician");
  return Response.json({ mode: parsed.data.mode });
}
