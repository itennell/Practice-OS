import { z } from "zod";
import { canDecide } from "@/lib/admin-guard";
import { saveReferralSettings } from "@/lib/referrals/settings";

// Settings › Referrals: the ZIP Aeon searches around for referral sources, her niche
// and the kinds she wants. Same fields onboarding sets (practice_os.referral_settings);
// saveReferralSettings checks the niche and kinds against the catalog and audits it.
const Body = z
  .object({
    homeZip: z.string().trim().max(10).optional(),
    nichePreset: z.string().trim().max(64).nullable().optional(),
    specialties: z.array(z.string().max(64)).max(40).optional(),
  })
  .strict()
  .refine((b) => b.homeZip !== undefined || b.nichePreset !== undefined || b.specialties !== undefined);

export async function PUT(request: Request) {
  if (!canDecide(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Pick from the list." }, { status: 400 });
  const { homeZip, nichePreset, specialties } = parsed.data;
  if (homeZip !== undefined && !/^\d{5}$/.test(homeZip)) return Response.json({ error: "Type your 5-digit ZIP code." }, { status: 400 });
  try {
    await saveReferralSettings({ homeZip, nichePreset: nichePreset === "" ? null : nichePreset, specialties });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Couldn't save. Try again." }, { status: 400 });
  }
  return Response.json({ ok: true, ...(homeZip !== undefined ? { homeZip } : {}), ...(nichePreset !== undefined ? { nichePreset: nichePreset || null } : {}) });
}
