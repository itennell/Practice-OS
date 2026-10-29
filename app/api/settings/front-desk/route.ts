import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { saveFrontDeskRules } from "@/lib/approval-settings";

// Settings > Front Desk: its own standing rules, separate from the chat mode.
export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = z
    .object({ text_missed_callers: z.boolean(), book_by_text: z.boolean(), send_reminders: z.boolean() })
    .partial()
    .strict()
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return Response.json({ error: "Send text_missed_callers, book_by_text or send_reminders as true or false." }, { status: 400 });
  }
  return Response.json(await saveFrontDeskRules(parsed.data, "clinician"));
}
