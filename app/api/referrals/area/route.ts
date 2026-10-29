import { AreaError, parseArea, practiceContext, RADII, searchArea } from "@/lib/referrals/area";
import { canSearch } from "@/lib/referrals/http";
import { limited } from "@/lib/referrals/rate-limit";
import { SPECIALTIES, type SpecialtyId } from "@/lib/referrals/nppes";

// The map's search. Read only: it asks the NPI Registry (and the free Census and
// OpenStreetMap geocoders) about an area, and saves nothing. It answers within
// two minutes, with what it has so far if the services are slow.
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!canSearch(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const tooMany = limited(request, "area", 10);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { area?: unknown; radiusMiles?: unknown; specialties?: unknown };
  const area = parseArea(typeof body.area === "string" ? body.area : "");
  const radiusMiles = RADII.includes(body.radiusMiles as (typeof RADII)[number]) ? (body.radiusMiles as number) : 3;
  const ids = new Set(SPECIALTIES.map((s) => s.id));
  const specialties = Array.isArray(body.specialties) ? (body.specialties.filter((s) => ids.has(s)) as SpecialtyId[]) : [];
  try {
    const result = await searchArea({ area, radiusMiles, specialties }, await practiceContext());
    return Response.json(result);
  } catch (err) {
    if (err instanceof AreaError) return Response.json({ error: err.message }, { status: 400 });
    console.error(`[referrals] area search: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "The NPI Registry didn't answer. Try again in a minute." }, { status: 502 });
  }
}
