import { canSearch } from "@/lib/referrals/http";
import { limited } from "@/lib/referrals/rate-limit";
import { suppressionFor } from "@/lib/referrals/contacts";
import { evidenceFor } from "@/lib/referrals/evidence/store";
import { RecheckTooSoon, recheckSource, recheckDeps } from "@/lib/referrals/sources/recheck";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// "Find email" on a Partners row: the same check as "Check again" (lib/referrals/sources/recheck.ts),
// which reads the practice's own website with every rule it already keeps (robots.txt, no
// directories or social sites, nothing from a site that asks not to be solicited, only an
// address on the practice's own domain, never a guess). Refused before any lookup for a
// sensitive organization (a DV/SA agency: their public line only) and for anyone on her
// do-not-contact list.
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/find-email">) {
  if (!canSearch(request)) return Response.json({ error: "Not allowed to check this here." }, { status: 403 });
  const tooMany = limited(request, "recheck", 10);
  if (tooMany) return tooMany;
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const card = await getSource(id);
  if (!card) return Response.json({ error: "Unknown card." }, { status: 404 });
  if (card.sensitive) return Response.json({ error: "Contact them through their public line only. Aeon doesn't look up an email for them." }, { status: 409 });
  if (card.stage === "not_a_fit" || (await suppressionFor(id))) {
    return Response.json({ error: "They're on your do-not-contact list or set aside, so Aeon doesn't look up an email." }, { status: 409 });
  }
  let result;
  try {
    result = await recheckSource(id, recheckDeps());
  } catch (err) {
    if (err instanceof RecheckTooSoon) return Response.json({ error: err.message }, { status: 429 });
    throw err;
  }
  const evidence = (await evidenceFor([{ id, npi_type: card.npi_type }]))[id];
  const after = await getSource(id);
  const email = evidence?.fields.email?.value ?? after?.email ?? null;
  return Response.json({ email, evidence, card: after, notes: result.notes, unavailable: result.unavailable });
}
