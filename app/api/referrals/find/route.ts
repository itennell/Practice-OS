import { canChange } from "@/lib/referrals/http";
import { SPECIALTIES, type SpecialtyId } from "@/lib/referrals/nppes";
import { findReferralSources } from "@/lib/referrals/store";

// The board's search box: the same search Aeon runs from the chat.
export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { zip?: unknown; specialties?: unknown };
  const zip = typeof body.zip === "string" ? body.zip.trim() : "";
  if (!/^\d{5}$/.test(zip)) return Response.json({ error: "Type a 5-digit ZIP code." }, { status: 400 });
  const ids = new Set(SPECIALTIES.map((s) => s.id));
  const specialties = Array.isArray(body.specialties) ? (body.specialties.filter((s) => ids.has(s)) as SpecialtyId[]) : [];
  if (specialties.length === 0) return Response.json({ error: "Pick at least one kind of referral source." }, { status: 400 });
  try {
    const { saved, matched } = await findReferralSources({ zip, specialties });
    return Response.json({ saved, matched });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "The NPI Registry didn't answer. Try again in a minute." }, { status: 502 });
  }
}
