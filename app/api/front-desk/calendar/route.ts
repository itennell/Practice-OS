import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { calcomEventTypes, chooseCalendar, connectCalcom, disconnectCalcom } from "@/lib/frontdesk/connect";

// The calendar Connect cards. Cal.com: paste the key, pick the consult type, live check.
// Google: the sign-in itself is desktop-app's Connect Google; this only records her choice.
const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("calcom_types"), apiKey: z.string().min(1).max(500) }),
  z.object({ step: z.literal("calcom_save"), apiKey: z.string().min(1).max(500), eventTypeId: z.number().int().positive() }),
  z.object({ step: z.literal("choose"), provider: z.enum(["calcom", "google"]) }),
]);

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, fix: "Paste your Cal.com key first." }, { status: 400 });
  const b = parsed.data;
  if (b.step === "calcom_types") {
    const out = await calcomEventTypes(b.apiKey);
    return Response.json(out, { status: out.ok ? 200 : 422 });
  }
  if (b.step === "calcom_save") {
    const out = await connectCalcom(b.apiKey, b.eventTypeId);
    return Response.json(out, { status: out.ok ? 200 : 422 });
  }
  await chooseCalendar(b.provider);
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  await disconnectCalcom();
  return Response.json({ ok: true });
}
