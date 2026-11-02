import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { audit } from "@/lib/audit";
import { db } from "@/lib/db";
import { normalizeUsPhone } from "@/lib/onboarding/chapters";

// Her own cell for urgent alerts (when a message in her chat mentions danger). Same field
// onboarding sets (settings.alert_phone), so she can change it any time in Settings.
const Body = z.object({ phone: z.string().trim().max(40) }).strict();

export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Type your cell number." }, { status: 400 });
  const phone = normalizeUsPhone(parsed.data.phone);
  if (!phone) return Response.json({ error: "Please type a 10-digit US cell number." }, { status: 400 });
  await db()`update practice_os.settings set alert_phone = ${phone}`;
  await audit({ actor: "clinician", action: "alert_phone_set", subjectType: "settings", details: { by: "settings" } });
  return Response.json({ ok: true, last4: phone.slice(-4) });
}
