import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { chooseCalendar, connectCalcomAuto, disconnectCalcom } from "@/lib/frontdesk/connect";

// The Cal.com Connect card: one pasted key, then Practice-OS checks it, finds or
// makes her consult, saves it and reads the next open time (lib/frontdesk/connect.ts).
// "choose" records her calendar: Cal.com only until Google Calendar returns.
const Body = z.discriminatedUnion("step", [
  z.object({ step: z.literal("calcom_auto"), apiKey: z.string().min(1).max(500) }),
  z.object({ step: z.literal("choose"), provider: z.enum(["calcom"]) }),
]);

export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, fix: "Paste your Cal.com key first." }, { status: 400 });
  const b = parsed.data;
  if (b.step === "calcom_auto") {
    const out = await connectCalcomAuto(b.apiKey);
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
