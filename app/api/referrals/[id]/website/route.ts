import { audit } from "@/lib/audit";
import { canChange } from "@/lib/referrals/http";
import { cleanWebsite, setTypedWebsite } from "@/lib/referrals/evidence/store";
import { getSource } from "@/lib/referrals/store";
import { isUuid } from "../../../approvals/responses";

// She typed the practice's website (or cleared it), so "Find email" has their own page to
// read. Not for a sensitive organization: Aeon reads nothing about them (their public line only).
export async function POST(request: Request, ctx: RouteContext<"/api/referrals/[id]/website">) {
  if (!canChange(request)) return Response.json({ error: "Not allowed to change this here." }, { status: 403 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return Response.json({ error: "Unknown card." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as { website?: unknown };
  const typed = typeof body.website === "string" ? body.website.trim() : "";
  const website = typed ? cleanWebsite(typed) : null;
  if (typed && !website) return Response.json({ error: "That doesn't look like a web address. Type it like example.com." }, { status: 400 });
  const card = await getSource(id);
  if (!card) return Response.json({ error: "Unknown card." }, { status: 404 });
  if (card.sensitive) return Response.json({ error: "Contact them through their public line only. Aeon doesn't read their website." }, { status: 409 });
  const evidence = await setTypedWebsite(id, website);
  await audit({ actor: "clinician", action: "referral_website_set", subjectType: "referral_source", subjectId: id, details: { set: Boolean(website) } });
  return Response.json({ evidence, card: await getSource(id) });
}
