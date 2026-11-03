import { canChange } from "@/lib/referrals/http";
import { addOrgsToBoard } from "@/lib/referrals/orgs";
import { limited } from "@/lib/referrals/rate-limit";
import { addToBoard } from "@/lib/referrals/store";

// "Add to board" on the map's lists. The page sends ids only: NPIs, each looked
// up again in the NPI Registry, and found places ("cms:<CCN>", "osm:node/123"),
// each looked up again at the CMS Provider Data Catalog or OpenStreetMap. All
// are saved under Found.
const ORG_KEY = /^(?:cms:[0-9A-Z]{6}|osm:(?:node|way|relation)\/\d{1,15})$/;

export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const tooMany = limited(request, "add", 30);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { items?: unknown; orgs?: unknown; center?: unknown };
  const seen = new Set<string>();
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((i): i is { npi: string; distanceMiles?: unknown; sensitive?: unknown } => typeof i?.npi === "string" && /^\d{10}$/.test(i.npi))
    .filter((i) => !seen.has(i.npi) && Boolean(seen.add(i.npi)))
    .slice(0, 50)
    .map((i) => ({ npi: i.npi, distanceMiles: typeof i.distanceMiles === "number" ? i.distanceMiles : null, sensitive: i.sensitive === true }));
  const orgs = (Array.isArray(body.orgs) ? body.orgs : [])
    .filter((i): i is { key: string; distanceMiles?: unknown } => typeof i?.key === "string" && ORG_KEY.test(i.key))
    .filter((i) => !seen.has(i.key) && Boolean(seen.add(i.key)))
    .slice(0, 50);
  if (items.length === 0 && orgs.length === 0) return Response.json({ error: "Pick someone to add." }, { status: 400 });
  const c = body.center;
  const center = Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === "number" && Number.isFinite(n)) ? (c as [number, number]) : null;
  try {
    const out: { added: { npi?: string; key?: string; id: string; name: string }[]; missing: string[]; matched?: { key?: string; id: string; name: string }[]; refused?: string[] } = { added: [], missing: [] };
    if (items.length) {
      const { added, missing } = await addToBoard(items);
      out.added.push(...added.map((a) => ({ npi: a.npi, id: a.id!, name: a.name })));
      out.missing.push(...missing);
    }
    if (orgs.length) {
      const distances = Object.fromEntries(orgs.map((o) => [o.key, typeof o.distanceMiles === "number" ? o.distanceMiles : null]));
      const r = await addOrgsToBoard(orgs.map((o) => o.key), { center, distances });
      out.added.push(...r.added.map((a) => ({ id: a.id, name: a.name })));
      out.matched = r.matched.map((m) => ({ id: m.id, name: m.name }));
      out.missing.push(...r.missing);
      out.refused = r.refused;
    }
    return Response.json(out);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "That source didn't answer. Try again in a minute." }, { status: 502 });
  }
}
