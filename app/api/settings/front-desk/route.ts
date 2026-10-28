import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { saveFrontDeskRules } from "@/lib/approval-settings";

// Settings > Front Desk: its own standing rules, separate from the chat mode.
export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = z.object({ text_missed_callers: z.boolean() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send text_missed_callers as true or false." }, { status: 400 });
  await saveFrontDeskRules(parsed.data, "clinician");
  return Response.json(parsed.data);
}
