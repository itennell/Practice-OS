import { canSearch } from "@/lib/referrals/http";
import { limited } from "@/lib/referrals/rate-limit";
import { evidenceFor } from "@/lib/referrals/evidence/store";
import { RecheckTooSoon, recheckSource, recheckDeps } from "@/lib/referrals/sources/recheck";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// "Check again" on a card: asks every source about it now (NPI Registry, CMS,
// the state license list, OpenStreetMap, their website) and returns the merge.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/recheck">) {
  if (!canSearch(request)) return Response.json({ error: "Not allowed to check this here." }, { status: 403 });
  const tooMany = limited(request, "recheck", 10);
  if (tooMany) return tooMany;
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const card = await getSource(id);
  if (!card) return Response.json({ error: "Unknown card." }, { status: 404 });
  let result;
  try {
    result = await recheckSource(id, recheckDeps());
  } catch (err) {
    if (err instanceof RecheckTooSoon) return Response.json({ error: err.message }, { status: 429 });
    throw err;
  }
  const evidence = (await evidenceFor([{ id, npi_type: card.npi_type }]))[id];
  return Response.json({ ...result, evidence, card: await getSource(id) });
}
