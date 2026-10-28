import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { checkMuseKey, removeMuseKey, saveMuseKey } from "@/lib/connect/muse";
import { isLocalRequest } from "@/lib/connect/local-only";

// Her own Meta Muse key: checked with one tiny call, then kept encrypted.
export async function POST(request: Request) {
  if (!canDecide(request) || !isLocalRequest(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = z.object({ key: z.string().trim().min(20).max(400) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Paste the whole key from Meta's key page." }, { status: 400 });
  const check = await checkMuseKey(parsed.data.key);
  if (!check.ok) {
    const error = check.reason === "rejected" ? "Meta didn't accept that key. Copy it again from Meta's key page." : "Couldn't reach Meta to check the key. Check your internet and try again.";
    return Response.json({ error }, { status: check.reason === "rejected" ? 400 : 502 });
  }
  await saveMuseKey(parsed.data.key);
  return Response.json({ connected: true, accountLabel: `Key ending ${parsed.data.key.slice(-4)}` });
}

export async function DELETE(request: Request) {
  if (!canDecide(request) || !isLocalRequest(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  await removeMuseKey();
  return Response.json({ connected: false });
}
