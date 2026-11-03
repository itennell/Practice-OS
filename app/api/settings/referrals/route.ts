import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { saveReferralSettings } from "@/lib/referrals/settings";

// Settings › Referrals: the ZIP Aeon searches around for referral sources. Same field
// onboarding sets (practice_os.referral_settings.home_zip); saveReferralSettings audits it.
const Body = z.object({ homeZip: z.string().trim().max(10) }).strict();

export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !/^\d{5}$/.test(parsed.data.homeZip)) return Response.json({ error: "Type your 5-digit ZIP code." }, { status: 400 });
  try {
    await saveReferralSettings({ homeZip: parsed.data.homeZip });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save. Try again." }, { status: 400 });
  }
  return Response.json({ ok: true, homeZip: parsed.data.homeZip });
}
