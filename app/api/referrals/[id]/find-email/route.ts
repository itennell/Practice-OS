import { canChange } from "@/lib/referrals/http";
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
// do-not-contact list. It saves what it finds to the card, so it uses the board's change check.
// Too soon: 423 with code "card_cooldown" (this card was checked in the last two minutes),
// 429 with code "busy" (too many checks this minute across all cards).
export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/find-email">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to check this here." }, { status: 403 });
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
    if (err instanceof RecheckTooSoon) {
      return err.kind === "card"
        ? Response.json({ error: err.message, code: "card_cooldown" }, { status: 423 })
        : Response.json({ error: err.message, code: "busy" }, { status: 429 });
    }
    throw err;
  }
  const evidence = (await evidenceFor([{ id, npi_type: card.npi_type }]))[id];
  const after = await getSource(id);
  const email = evidence?.fields.email?.value ?? after?.email ?? null;
  // The page it read, if any: with none, the row says "No website on file to check" and offers Add website.
  const website = evidence?.fields.website?.value ?? after?.website ?? null;
  return Response.json({ email, website, evidence, card: after, notes: result.notes, unavailable: result.unavailable });
}
