import { db } from "@/lib/db";
import { AreaError, RADII } from "@/lib/referrals/area";
import { canSearch } from "@/lib/referrals/http";
import { discoverOrgs, discoveryContext, DISCOVERY_IDS, parseArea } from "@/lib/referrals/orgs";
import { limited } from "@/lib/referrals/rate-limit";
import { listSources } from "@/lib/referrals/store";

// "Places near you": hospices and home health agencies (CMS Provider Data
// Catalog) and funeral homes, places of worship, libraries and community
// centres, senior living (OpenStreetMap, one Overpass question per search).
// Read only: saves nothing. Answers are cached a day (lib/referrals/sources/cache.ts).
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!canSearch(request)) return Response.json({ error: "Not allowed here." }, { status: 403 });
  const tooMany = limited(request, "discover", 6);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { area?: unknown; radiusMiles?: unknown; types?: unknown };
  const area = parseArea(typeof body.area === "string" ? body.area : "");
  const radiusMiles = RADII.includes(body.radiusMiles as (typeof RADII)[number]) ? (body.radiusMiles as number) : 3;
  const known = new Set<string>(DISCOVERY_IDS);
  const types = Array.isArray(body.types) ? body.types.filter((t): t is string => typeof t === "string" && known.has(t)) : [];
  if (Array.isArray(body.types) && types.length === 0) return Response.json({ error: "Pick at least one kind of place." }, { status: 400 });
  try {
    const ctx = await discoveryContext();
    const result = await discoverOrgs({ area, radiusMiles, types: types.length ? types : null, niche: ctx.niche }, ctx, { cards: await listSources(), sql: db() });
    return Response.json(result);
  } catch (err) {
    if (err instanceof AreaError) return Response.json({ error: err.message }, { status: 400 });
    console.error(`[referrals] discover: ${err instanceof Error ? err.message : String(err)}`);
    return Response.json({ error: "Those sources didn't answer. Try again in a minute." }, { status: 502 });
  }
}
