import { canChange } from "@/lib/referrals/http";
import { limited } from "@/lib/referrals/rate-limit";
import { addToBoard } from "@/lib/referrals/store";

// "Add to board" on the map's list. The page sends NPIs only; each is looked up
// again in the NPI Registry before it is saved under Found.
export async function POST(request: Request) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const tooMany = limited(request, "add", 30);
  if (tooMany) return tooMany;
  const body = (await request.json().catch(() => ({}))) as { items?: unknown };
  const seen = new Set<string>();
  const items = (Array.isArray(body.items) ? body.items : [])
    .filter((i): i is { npi: string; distanceMiles?: unknown } => typeof i?.npi === "string" && /^\d{10}$/.test(i.npi))
    .filter((i) => !seen.has(i.npi) && Boolean(seen.add(i.npi)))
    .slice(0, 50)
    .map((i) => ({ npi: i.npi, distanceMiles: typeof i.distanceMiles === "number" ? i.distanceMiles : null }));
  if (items.length === 0) return Response.json({ error: "Pick someone to add." }, { status: 400 });
  try {
    const { added, missing } = await addToBoard(items);
    return Response.json({ added: added.map((a) => ({ npi: a.npi, id: a.id, name: a.name })), missing });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "The NPI Registry didn't answer. Try again in a minute." }, { status: 502 });
  }
}
