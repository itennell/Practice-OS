import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { connectSpruce, disconnectPhone } from "@/lib/frontdesk/connect";

// The phone Connect card: paste the Spruce token, live check, then save.
export async function POST(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const parsed = z.object({ vendor: z.literal("spruce"), token: z.string().min(1).max(4000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, fix: "Paste your Spruce token first." }, { status: 400 });
  const result = await connectSpruce(parsed.data.token);
  return Response.json(result, { status: result.ok ? 200 : 422 });
}

export async function DELETE(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  await disconnectPhone();
  return Response.json({ ok: true });
}
